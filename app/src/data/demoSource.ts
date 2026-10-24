// Modo DEMONSTRAÇÃO: banco em memória (persistido no navegador) que reproduz
// as regras do banco real — permissões por perfil (RLS), cálculo do valor pago,
// unicidade de CPF/CNPJ, travas fiscais e auditoria. Nenhum dado sai do navegador
// e nenhuma chamada fiscal externa é feita.
import { onlyDigits } from '../lib/documents';
import { round2, today } from '../lib/format';
import { can } from '../lib/permissions';
import type { Attachment, Profile, TableName } from '../lib/types';
import { buildDemoDb, type DemoDb } from './demoSeed';
import { checkAttachment, keyOf, type DataSource, type FiscalCallResult, type Row } from './source';
import { buildNfseRequest } from '../../../supabase/functions/_shared/nfseEndpoints';

const STORE_KEY = 'associapec-financeiro-demo-v1';
const DENIED = 'Seu perfil não tem permissão para esta operação.';

type AnyRow = Record<string, unknown>;

// chaves estrangeiras que bloqueiam exclusão (espelham o schema)
const REFERENCES: Partial<Record<TableName, [TableName, string][]>> = {
  parties: [['receivables', 'party_id'], ['payables', 'party_id'], ['nfse_documents', 'party_id']],
  categories: [['receivables', 'category_id'], ['payables', 'category_id'], ['services', 'category_id']],
  services: [['receivables', 'service_id'], ['nfse_documents', 'service_id']],
  receivables: [['nfse_documents', 'receivable_id']],
  payables: [['payables', 'recurrence_parent_id']],
};
const CASCADE: Partial<Record<TableName, [TableName, string][]>> = {
  receivables: [['receivable_payments', 'receivable_id']],
  payables: [['payable_payments', 'payable_id']],
};
const PAYMENTS: Partial<Record<TableName, { parent: 'receivables' | 'payables'; fk: string }>> = {
  receivable_payments: { parent: 'receivables', fk: 'receivable_id' },
  payable_payments: { parent: 'payables', fk: 'payable_id' },
};

export class DemoSource implements DataSource {
  readonly mode = 'demo' as const;
  private db: DemoDb;
  private files = new Map<string, Blob>();
  user: Profile | null = null;

  constructor(private storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null, private todayIso = today()) {
    this.db = this.load();
  }

  private load(): DemoDb {
    try {
      const raw = this.storage?.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.seededFor) return parsed;
      }
    } catch { /* armazenamento indisponível: segue em memória */ }
    return buildDemoDb(this.todayIso);
  }
  private persist() {
    try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.db)); } catch { /* ignora */ }
  }
  reset() {
    this.db = buildDemoDb(this.todayIso);
    this.files.clear();
    this.persist();
  }

  private rows(table: TableName) { return this.db[table] as unknown as AnyRow[]; }
  private require(op: 'read' | 'write' | 'delete', table: TableName) {
    if (!this.user || !this.user.active) throw new Error('Sessão encerrada. Entre novamente.');
    if (!can(this.user.role, op, table)) throw new Error(DENIED);
  }
  private audit(table: TableName, action: 'INSERT' | 'UPDATE' | 'DELETE', oldRow: AnyRow | null, newRow: AnyRow | null) {
    const rec = (newRow ?? oldRow)!;
    this.db.audit_log.unshift({
      id: this.db.seq++, table_name: table, record_id: String(rec[keyOf(table)] ?? ''), action,
      old_data: oldRow ? { ...oldRow } : null, new_data: newRow ? { ...newRow } : null,
      actor: this.user?.id ?? null, at: new Date().toISOString(),
    });
    if (this.db.audit_log.length > 2000) this.db.audit_log.length = 2000;
  }
  private newId(table: string) { return `${table.slice(0, 3)}-${String(this.db.seq++).padStart(4, '0')}`; }

  async list<T extends TableName>(table: T): Promise<Row<T>[]> {
    if (table === 'profiles' && this.user && this.user.role !== 'admin') {
      return this.rows('profiles').filter((p) => p.id === this.user!.id).map((r) => ({ ...r })) as unknown as Row<T>[];
    }
    this.require('read', table);
    return this.rows(table).map((r) => ({ ...r })) as unknown as Row<T>[];
  }

  /** Regras equivalentes às constraints e triggers do Postgres. */
  private validate(table: TableName, row: AnyRow, old: AnyRow | null) {
    if (table === 'parties') {
      const doc = row.document ? onlyDigits(String(row.document)) : null;
      row.document = doc || null;
      if (doc && !((row.person_type === 'PF' && doc.length === 11) || (row.person_type === 'PJ' && doc.length === 14))) {
        throw new Error('Documento incompatível com o tipo de pessoa.');
      }
      if (doc && this.rows('parties').some((p) => p.document === doc && p.id !== row.id)) {
        throw new Error('Registro duplicado (já existe um cadastro com este CPF/CNPJ).');
      }
      if (!String(row.name ?? '').trim()) throw new Error('Nome obrigatório.');
    }
    if (table === 'categories' && this.rows('categories').some((c) => c.id !== row.id && c.type === row.type && String(c.name).toLowerCase() === String(row.name).toLowerCase())) {
      throw new Error('Registro duplicado (categoria já existe).');
    }
    if (table === 'services') {
      if (row.tax_validated && !row.c_trib_mun) throw new Error('Não é possível validar um serviço sem código de tributação municipal (cTribMun).');
      const taxFields = ['c_trib_mun', 'c_trib_nac', 'nbs', 'iss_rate', 'tax_validated', 'tax_validated_by'];
      const changed = old ? taxFields.some((f) => (row[f] ?? null) !== (old[f] ?? null)) : !!(row.c_trib_mun || row.tax_validated || row.iss_rate != null);
      if (changed && !['admin', 'fiscal'].includes(this.user?.role ?? '')) throw new Error('Somente os perfis Fiscal e Administrador alteram dados tributários.');
      const codeChanged = old && ['c_trib_mun', 'c_trib_nac', 'iss_rate'].some((f) => (row[f] ?? null) !== (old[f] ?? null));
      if (old?.tax_validated && row.tax_validated && codeChanged) throw new Error('Alterar o código tributário exige nova validação.');
    }
    if (table === 'receivables' || table === 'payables') {
      if (!(Number(row.amount) > 0)) throw new Error('Valor deve ser maior que zero.');
      if (old && row.paid_amount !== old.paid_amount) throw new Error('O valor pago é calculado a partir dos pagamentos.');
      if (Number(row.amount) < Number(row.paid_amount)) throw new Error('O valor da conta não pode ser menor que o total já pago.');
      if (table === 'payables' && row.recurrence_parent_id && this.rows('payables').some((p) => p.id !== row.id && p.recurrence_parent_id === row.recurrence_parent_id && p.due_date === row.due_date)) {
        throw new Error('Registro duplicado (esta ocorrência recorrente já foi gerada).');
      }
    }
    if (table === 'nfse_documents') {
      if (row.environment !== 'homologacao') throw new Error('Registros de produção só podem ser criados pelo backend fiscal.');
      if (!['rascunho', 'validada'].includes(String(row.status))) throw new Error(`Status ${row.status} só pode ser definido pelo backend fiscal.`);
      if (old && !['rascunho', 'validada'].includes(String(old.status))) throw new Error('Documento já enviado não pode ser alterado pelo usuário.');
      if (row.chave_acesso || row.dps_id) throw new Error('Campos de retorno fiscal são preenchidos apenas pelo backend.');
    }
    if (table === 'profiles' && old && row.id === this.user?.id && row.role !== old.role) {
      throw new Error('Um administrador não pode alterar o próprio papel.');
    }
  }

  private syncPaid(table: TableName, fkValue: string) {
    const meta = PAYMENTS[table];
    if (!meta) return;
    const parent = this.rows(meta.parent).find((p) => p.id === fkValue);
    if (!parent) throw new Error('Conta não encontrada.');
    const total = round2(this.rows(table).filter((p) => p[meta.fk] === fkValue).reduce((a, p) => a + Number(p.amount), 0));
    if (total > Number(parent.amount)) throw new Error(`Pagamentos (${total.toFixed(2)}) excedem o valor da conta (${Number(parent.amount).toFixed(2)}).`);
    const before = { ...parent };
    parent.paid_amount = total;
    this.audit(meta.parent, 'UPDATE', before, { ...parent });
  }

  async insert<T extends TableName>(table: T, input: Partial<Row<T>>): Promise<Row<T>> {
    this.require('write', table);
    const row: AnyRow = { ...input };
    if (keyOf(table) === 'id' && !row.id) row.id = this.newId(table);
    row.created_at ??= new Date().toISOString();
    if (table === 'receivables' || table === 'payables') row.paid_amount = 0;
    if (table === 'nfse_documents') { row.environment ??= 'homologacao'; row.status ??= 'rascunho'; }
    this.validate(table, row, null);
    const meta = PAYMENTS[table];
    if (meta) {
      const parent = this.rows(meta.parent).find((p) => p.id === row[meta.fk]);
      if (parent?.canceled_at) throw new Error('Não é possível registrar pagamento em conta cancelada.');
      if (!(Number(row.amount) > 0)) throw new Error('Valor deve ser maior que zero.');
    }
    this.rows(table).push(row);
    try {
      if (meta) this.syncPaid(table, String(row[meta.fk]));
    } catch (e) {
      this.rows(table).pop();
      throw e;
    }
    this.audit(table, 'INSERT', null, row);
    this.persist();
    return { ...row } as unknown as Row<T>;
  }

  async update<T extends TableName>(table: T, key: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    this.require('write', table);
    const current = this.rows(table).find((r) => r[keyOf(table)] === key);
    if (!current) throw new Error('Registro não encontrado.');
    const next: AnyRow = { ...current, ...patch, updated_at: new Date().toISOString() };
    this.validate(table, next, current);
    const before = { ...current };
    Object.assign(current, next);
    this.audit(table, 'UPDATE', before, { ...current });
    this.persist();
    return { ...current } as unknown as Row<T>;
  }

  async remove(table: TableName, key: string) {
    this.require('delete', table);
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => r[keyOf(table)] === key);
    if (idx < 0) throw new Error('Registro não encontrado.');
    if (table === 'nfse_documents' && rows[idx].status !== 'rascunho') throw new Error('Somente rascunhos podem ser excluídos.');
    for (const [ref, fk] of REFERENCES[table] ?? []) {
      if (this.rows(ref).some((r) => r[fk] === key)) throw new Error('Não é possível excluir: existem lançamentos vinculados a este registro.');
    }
    for (const [child, fk] of CASCADE[table] ?? []) {
      const kids = this.rows(child);
      for (let i = kids.length - 1; i >= 0; i--) if (kids[i][fk] === key) { this.audit(child, 'DELETE', kids[i], null); kids.splice(i, 1); }
    }
    const [old] = rows.splice(idx, 1);
    const meta = PAYMENTS[table];
    if (meta) this.syncPaid(table, String(old[meta.fk]));
    this.audit(table, 'DELETE', old, null);
    this.persist();
  }

  async uploadAttachment(entity: Attachment['entity'], entityId: string, file: File) {
    const problem = checkAttachment(file);
    if (problem) throw new Error(problem);
    this.require('write', 'attachments');
    const path = `${entity}/${entityId}/${Date.now()}-${file.name}`;
    this.files.set(path, file);
    return this.insert('attachments', { entity, entity_id: entityId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
  }

  async attachmentUrl(att: Attachment) {
    const blob = this.files.get(att.storage_path);
    if (!blob) throw new Error('No modo demonstração o arquivo fica disponível apenas na sessão em que foi anexado.');
    return URL.createObjectURL(blob);
  }

  async callFiscal(action: Parameters<DataSource['callFiscal']>[0], payload: Parameters<DataSource['callFiscal']>[1]): Promise<FiscalCallResult> {
    if (!this.user || !['admin', 'fiscal'].includes(this.user.role)) return { status: 'erro', message: 'Perfil sem permissão para operações fiscais' };
    const message = 'Modo demonstração: nenhuma comunicação com a prefeitura foi realizada. A integração será habilitada após confirmação do certificado e liberação da homologação.';
    let url = '(parâmetros inválidos)';
    try { url = buildNfseRequest('homologacao', action, payload).url; } catch { /* registra mesmo assim */ }
    this.db.nfse_requests.unshift({
      id: this.db.seq++, nfse_document_id: payload.documentId ?? null, environment: 'homologacao', operation: action,
      http_method: action.startsWith('consultar') ? 'GET' : 'POST', url, http_status: null, error: message, created_at: new Date().toISOString(),
    });
    this.persist();
    return { status: 'nao_habilitado', message };
  }
}
