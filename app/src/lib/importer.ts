// Importador configurável das planilhas mensais (Excel/CSV).
//
// O layout oficial das planilhas do Estado ainda não foi recebido: nada aqui
// assume nomes de colunas fixos. O mapeamento é sugerido por sinônimos e sempre
// confirmado pela pessoa antes de gravar. Classificação da prévia inspirada no
// importador de pacientes do Neuro Hub Pro (novo / duplicado / revisão / não importado).
import { isValidCNPJ, isValidCPF, onlyDigits } from './documents';
import { isoDate, round2 } from './format';
import { formatIE, ieKey, isUF, normalizeIE, validateIE } from './ie';
import { normalizeName, similarNames } from './text';
import type { Party, PartyRegistration, Receivable } from './types';

// ---------------------------------------------------------------------------
// Leitura de arquivos
// ---------------------------------------------------------------------------
export interface SheetData { name: string; rows: string[][] }

/** CSV com detecção de separador (; , ou tab), aspas e BOM. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** Decodifica texto tentando UTF-8 e, se houver caracteres inválidos, Windows-1252 (Excel BR). */
export function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return isoDate(new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return cellToText(v.result);
    if (v.text !== undefined) return String(v.text);
    return '';
  }
  return String(value).trim();
}

/** Lê .xlsx (ExcelJS, carregado sob demanda) ou .csv. */
export async function readSpreadsheet(fileName: string, buffer: ArrayBuffer): Promise<SheetData[]> {
  if (/\.csv$|\.txt$/i.test(fileName)) return [{ name: 'CSV', rows: parseCsv(decodeText(buffer)) }];
  if (!/\.xlsx$/i.test(fileName)) throw new Error('Formato não suportado. Use .xlsx (Excel) ou .csv. Arquivos .xls antigos devem ser salvos como .xlsx.');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) values.push(cellToText(row.getCell(c).value));
      if (values.some((v) => v !== '')) rows.push(values);
    });
    return { name: ws.name, rows };
  }).filter((s) => s.rows.length > 0);
}

/** Lê o arquivo como ArrayBuffer (com reserva via FileReader para navegadores antigos). */
export function readFileBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas
// ---------------------------------------------------------------------------
export type ImportField =
  | 'ie_uf' | 'ie' | 'document' | 'name' | 'property_name' | 'city' | 'uf' | 'email' | 'phone' | 'cep' | 'street'
  | 'amount' | 'due_date' | 'reference' | 'description' | 'document_number' | 'notes';

export const FIELD_DEFS: { field: ImportField; label: string; group: 'Identificação' | 'Cadastro' | 'Financeiro'; synonyms: string[] }[] = [
  { field: 'ie', label: 'Inscrição estadual', group: 'Identificação', synonyms: ['inscricao estadual', 'insc estadual', 'insc. estadual', 'ie', 'i.e.', 'inscricao', 'ie produtor', 'inscr estadual', 'num ie'] },
  { field: 'ie_uf', label: 'UF da inscrição', group: 'Identificação', synonyms: ['uf ie', 'uf da ie', 'uf inscricao', 'estado ie'] },
  { field: 'document', label: 'CPF/CNPJ', group: 'Identificação', synonyms: ['cpf/cnpj', 'cpf cnpj', 'cpf', 'cnpj', 'documento', 'cpf ou cnpj', 'cnpj/cpf', 'doc'] },
  { field: 'name', label: 'Nome / razão social', group: 'Identificação', synonyms: ['nome', 'produtor', 'razao social', 'nome do produtor', 'contribuinte', 'associado', 'cliente', 'nome/razao social', 'proprietario'] },
  { field: 'property_name', label: 'Propriedade / fazenda', group: 'Cadastro', synonyms: ['propriedade', 'fazenda', 'nome da propriedade', 'imovel', 'estabelecimento'] },
  { field: 'city', label: 'Município', group: 'Cadastro', synonyms: ['municipio', 'cidade', 'localidade'] },
  { field: 'uf', label: 'UF (endereço)', group: 'Cadastro', synonyms: ['uf', 'estado'] },
  { field: 'email', label: 'E-mail', group: 'Cadastro', synonyms: ['email', 'e-mail', 'correio eletronico'] },
  { field: 'phone', label: 'Telefone', group: 'Cadastro', synonyms: ['telefone', 'fone', 'celular', 'contato', 'tel'] },
  { field: 'cep', label: 'CEP', group: 'Cadastro', synonyms: ['cep'] },
  { field: 'street', label: 'Endereço', group: 'Cadastro', synonyms: ['endereco', 'logradouro', 'rua'] },
  { field: 'amount', label: 'Valor', group: 'Financeiro', synonyms: ['valor', 'valor total', 'vlr', 'valor (r$)', 'total', 'valor devido', 'contribuicao'] },
  { field: 'due_date', label: 'Vencimento', group: 'Financeiro', synonyms: ['vencimento', 'data vencimento', 'dt vencimento', 'data de vencimento', 'venc'] },
  { field: 'reference', label: 'Competência / referência', group: 'Financeiro', synonyms: ['competencia', 'referencia', 'mes referencia', 'mes/ano', 'periodo', 'mes'] },
  { field: 'description', label: 'Descrição', group: 'Financeiro', synonyms: ['descricao', 'historico', 'servico', 'tipo'] },
  { field: 'document_number', label: 'Nº documento / guia', group: 'Financeiro', synonyms: ['numero documento', 'n documento', 'documento n', 'guia', 'numero', 'nosso numero', 'protocolo', 'n guia', 'dae'] },
  { field: 'notes', label: 'Observações', group: 'Financeiro', synonyms: ['observacao', 'observacoes', 'obs'] },
];

export type ColumnMapping = Partial<Record<ImportField, number>>;

const headerKey = (h: string) => normalizeName(h).replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
// sinônimos passam pela mesma normalização dos cabeçalhos ("E-mail" → "e mail")
const SYNONYM_KEYS = new Map(FIELD_DEFS.map((f) => [f.field, f.synonyms.map(headerKey)]));

/** Linha de cabeçalho: entre as 10 primeiras, a que mais casa com os sinônimos. */
export function detectHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const score = row.filter((c) => FIELD_DEFS.some((f) => SYNONYM_KEYS.get(f.field)!.includes(headerKey(c)))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

/** Sugere o mapeamento por sinônimos (correspondência exata antes da parcial). */
export function autoMap(headers: string[]): ColumnMapping {
  const keys = headers.map(headerKey);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const pass of ['exact', 'partial'] as const) {
    for (const def of FIELD_DEFS) {
      if (mapping[def.field] !== undefined) continue;
      const syn = SYNONYM_KEYS.get(def.field)!;
      const idx = keys.findIndex((k, i) => !used.has(i) && k && (pass === 'exact'
        ? syn.includes(k)
        : syn.some((s) => s.length > 3 && (k.startsWith(s + ' ') || k.endsWith(' ' + s) || k.includes(` ${s} `)))));
      if (idx >= 0) { mapping[def.field] = idx; used.add(idx); }
    }
  }
  return mapping;
}

/** Assinatura do cabeçalho (para lembrar o mapeamento da próxima planilha igual). */
export const headerSignature = (headers: string[]) => headers.map(headerKey).join('|');

// ---------------------------------------------------------------------------
// Conversão de valores
// ---------------------------------------------------------------------------
export function parseAmount(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  let normalized = s;
  if (s.includes(',') && s.includes('.')) normalized = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) normalized = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return round2(Number(normalized));
}

/** Aceita dd/mm/aaaa, aaaa-mm-dd e número de série do Excel. */
export function parseDate(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return valid(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5);
    return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
  function valid(y: number, mo: number, d: number) {
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? isoDate(dt) : null;
  }
}

/** Competência como AAAA-MM (aceita 10/2026, 2026-10, out/2026, data completa). */
export function parseReference(raw: string): string | null {
  const s = normalizeName(raw);
  if (!s) return null;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  let m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^([a-z]{3})[a-z]*[/. -]+(\d{2,4})$/);
  if (m && months.includes(m[1])) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}`;
  const d = parseDate(raw);
  return d ? d.slice(0, 7) : null;
}

// ---------------------------------------------------------------------------
// Análise (prévia) — nada é gravado aqui
// ---------------------------------------------------------------------------
export type RowClass = 'novo' | 'vinculado' | 'revisar' | 'duplicado' | 'erro';

export interface ImportOptions {
  defaultUf: string;
  source: string;
  createParties: boolean;
  /** 'preencher': só completa campos vazios; 'atualizar': substitui valores divergentes (nunca por vazio) */
  updateMode: 'preencher' | 'atualizar';
  generateReceivables: boolean;
  generateCharges: boolean;
  defaultDescription: string;
  defaultReference: string | null;
}

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  uf: string;
  ie: string;
  document: string;
  name: string;
  property_name: string;
  city: string;
  addressUf: string;
  email: string;
  phone: string;
  cep: string;
  street: string;
  amount: number | null;
  due_date: string | null;
  reference: string | null;
  description: string;
  document_number: string;
  notes: string;
}

export interface AnalyzedRow extends ParsedRow {
  cls: RowClass;
  /** cadastro associado com segurança (IE ou CPF/CNPJ) */
  partyId: string | null;
  /** cadastros candidatos para confirmação humana */
  candidates: { partyId: string; reason: string }[];
  /** chave de identidade dentro do lote (linhas do mesmo produtor ainda não cadastrado) */
  identity: string;
  registrationId: string | null;
  newRegistration: boolean;
  /** campos do cadastro existente que serão preenchidos/atualizados */
  updates: Partial<Party>;
  /** valores diferentes do cadastro que NÃO serão aplicados no modo "preencher" */
  divergences: string[];
  /** diferenças campo a campo com o cadastro existente: só são gravadas após conferência e aprovação */
  changes: FieldChange[];
  importKey: string | null;
  financial: boolean;
  errors: string[];
  warnings: string[];
}

export const CHANGE_LABEL: Record<string, string> = {
  email: 'E-mail', phone: 'Telefone', cep: 'CEP', street: 'Endereço', city: 'Cidade', uf: 'UF', document: 'CPF/CNPJ',
};
export interface FieldChange { field: keyof Party; label: string; from: string | null; to: string; kind: 'preencher' | 'divergente' }

export function parseRow(cells: string[], headers: string[], mapping: ColumnMapping, rowNumber: number, opts: Pick<ImportOptions, 'defaultUf' | 'defaultReference'>): ParsedRow {
  const get = (f: ImportField) => (mapping[f] !== undefined ? String(cells[mapping[f]!] ?? '').trim() : '');
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => { if (h || cells[i]) raw[h || `Coluna ${i + 1}`] = String(cells[i] ?? ''); });
  const ufRaw = get('ie_uf').toUpperCase();
  const addressUf = get('uf').toUpperCase();
  const uf = isUF(ufRaw) ? ufRaw : isUF(addressUf) && !mapping.ie_uf ? addressUf : opts.defaultUf;
  return {
    rowNumber, raw, uf,
    ie: /isent/i.test(get('ie')) ? '' : normalizeIE(get('ie')),
    document: onlyDigits(get('document')),
    name: get('name').replace(/\s+/g, ' '),
    property_name: get('property_name'),
    city: get('city'),
    addressUf: isUF(addressUf) ? addressUf : '',
    email: get('email').toLowerCase(),
    phone: onlyDigits(get('phone')),
    cep: onlyDigits(get('cep')),
    street: get('street'),
    amount: mapping.amount !== undefined ? parseAmount(get('amount')) : null,
    due_date: mapping.due_date !== undefined ? parseDate(get('due_date')) : null,
    reference: (mapping.reference !== undefined ? parseReference(get('reference')) : null) ?? opts.defaultReference,
    description: get('description'),
    document_number: get('document_number'),
    notes: get('notes'),
  };
}

export interface ExistingData { parties: Party[]; registrations: PartyRegistration[]; receivables: Pick<Receivable, 'import_key'>[] }

/** Chave antiduplicidade do lançamento: mesma pessoa + competência/vencimento + documento/descrição + valor. */
export function buildImportKey(source: string, r: Pick<ParsedRow, 'uf' | 'ie' | 'document' | 'reference' | 'due_date' | 'document_number' | 'description' | 'amount'>, defaultDescription: string): string {
  const who = r.ie ? ieKey(r.uf, r.ie) : `DOC:${r.document}`;
  const when = r.reference ?? r.due_date ?? '';
  const what = normalizeName(r.document_number || r.description || defaultDescription);
  return [normalizeName(source) || 'planilha', who, when, what, (r.amount ?? 0).toFixed(2)].join('|');
}

export function analyzeRows(rows: ParsedRow[], existing: ExistingData, opts: ImportOptions): AnalyzedRow[] {
  const regByKey = new Map(existing.registrations.map((r) => [ieKey(r.uf, r.ie), r]));
  const partyById = new Map(existing.parties.map((p) => [p.id, p]));
  const partyByDoc = new Map(existing.parties.filter((p) => p.document).map((p) => [p.document!, p]));
  const existingKeys = new Set(existing.receivables.map((r) => r.import_key).filter(Boolean) as string[]);
  const keysInFile = new Map<string, number>();
  const identityName = new Map<string, string>();

  return rows.map((r): AnalyzedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const out: AnalyzedRow = { ...r, cls: 'novo', partyId: null, candidates: [], identity: '', registrationId: null, newRegistration: false, updates: {}, divergences: [], changes: [], importKey: null, financial: false, errors, warnings };

    // --- validação de identificadores
    if (r.ie) {
      const err = validateIE(r.uf, r.ie);
      if (err) errors.push(`IE ${formatIE(r.uf, r.ie)}: ${err}`);
    }
    if (r.document) {
      const ok = r.document.length === 11 ? isValidCPF(r.document) : r.document.length === 14 ? isValidCNPJ(r.document) : false;
      if (!ok) errors.push(`CPF/CNPJ inválido (${r.document}).`);
    }
    if (!r.ie && !r.document && !r.name) { errors.push('Linha sem inscrição estadual, CPF/CNPJ ou nome.'); }

    // --- associação: 1º UF+IE, 2º CPF/CNPJ, nome apenas como informação auxiliar
    const reg = r.ie ? regByKey.get(ieKey(r.uf, r.ie)) : undefined;
    const byIe = reg ? partyById.get(reg.party_id) : undefined;
    const byDoc = r.document ? partyByDoc.get(r.document) : undefined;
    if (byIe && byDoc && byIe.id !== byDoc.id) {
      out.candidates.push({ partyId: byIe.id, reason: `IE pertence a ${byIe.name}` }, { partyId: byDoc.id, reason: `CPF/CNPJ pertence a ${byDoc.name}` });
      warnings.push('IE e CPF/CNPJ apontam para cadastros diferentes. Confirme qual usar.');
    } else if (byIe || byDoc) {
      const party = (byIe ?? byDoc)!;
      out.partyId = party.id;
      out.registrationId = reg?.id ?? null;
      if (byIe && r.document && party.document && party.document !== r.document) {
        out.candidates.push({ partyId: party.id, reason: `IE pertence a ${party.name}, mas o CPF/CNPJ da planilha é outro` });
        out.partyId = null;
        warnings.push('A IE está cadastrada com outro CPF/CNPJ. Confirme antes de associar.');
      }
      if (byDoc && !byIe && r.ie) out.newRegistration = true; // mesma pessoa, nova propriedade/IE
      if (r.name && !similarNames(party.name, r.name) && normalizeName(party.name) !== normalizeName(r.name)) warnings.push(`Nome na planilha (“${r.name}”) difere do cadastro (“${party.name}”).`);
    } else if (r.name) {
      const sameName = existing.parties.filter((p) => similarNames(p.name, r.name));
      if (sameName.length) {
        sameName.slice(0, 3).forEach((p) => out.candidates.push({ partyId: p.id, reason: `nome ${normalizeName(p.name) === normalizeName(r.name) ? 'igual' : 'parecido'}` }));
        warnings.push('Encontrado cadastro com nome igual ou parecido, sem IE/CPF/CNPJ coincidente. Confirme se é a mesma pessoa.');
      }
    }

    // --- atualização controlada (nunca apaga com vazio)
    if (out.partyId) {
      const party = partyById.get(out.partyId)!;
      const incoming: Partial<Party> = {
        email: r.email || undefined, phone: r.phone || undefined, cep: r.cep || undefined, street: r.street || undefined,
        city: r.city || undefined, uf: r.addressUf || undefined, document: r.document || undefined,
      };
      for (const [k, v] of Object.entries(incoming) as [keyof Party, string | undefined][]) {
        if (!v) continue;
        const current = party[k] as string | null;
        if (!current) {
          (out.updates as Record<string, string>)[k] = v;
          out.changes.push({ field: k, label: CHANGE_LABEL[k] ?? k, from: null, to: v, kind: 'preencher' });
        } else if (normalizeName(current) !== normalizeName(v)) {
          // CPF/CNPJ divergente nunca é substituído pela importação
          if (k !== 'document') out.changes.push({ field: k, label: CHANGE_LABEL[k] ?? k, from: current, to: v, kind: 'divergente' });
          if (opts.updateMode === 'atualizar' && k !== 'document') (out.updates as Record<string, string>)[k] = v;
          else out.divergences.push(`${k}: “${current}” → “${v}”`);
        }
      }
    }

    // --- identidade dentro do lote (várias linhas do mesmo produtor novo)
    out.identity = out.partyId ? `P:${out.partyId}` : r.ie ? ieKey(r.uf, r.ie) : r.document ? `DOC:${r.document}` : `NOME:${normalizeName(r.name)}`;
    if (!out.partyId && identityName.has(out.identity) && r.name && normalizeName(identityName.get(out.identity)!) !== normalizeName(r.name)) {
      warnings.push(`A mesma identificação aparece no arquivo com outro nome (“${identityName.get(out.identity)}”).`);
    }
    if (!identityName.has(out.identity) && r.name) identityName.set(out.identity, r.name);

    // --- lançamento financeiro
    const hasFinancialColumns = r.amount !== null || r.due_date !== null;
    if (opts.generateReceivables && hasFinancialColumns) {
      if (r.amount === null || r.amount <= 0) errors.push('Valor ausente ou inválido para gerar o lançamento.');
      if (!r.due_date) errors.push('Vencimento ausente ou inválido para gerar o lançamento.');
      if (r.amount && r.amount > 0 && r.due_date) {
        out.financial = true;
        out.importKey = buildImportKey(opts.source, r, opts.defaultDescription);
        const seenAt = keysInFile.get(out.importKey);
        if (existingKeys.has(out.importKey)) { out.financial = false; warnings.push('Lançamento já importado anteriormente (não será duplicado).'); }
        else if (seenAt !== undefined) { out.financial = false; warnings.push(`Lançamento repetido no próprio arquivo (igual à linha ${seenAt}).`); }
        else keysInFile.set(out.importKey, r.rowNumber);
      }
    }

    // --- classificação final
    if (errors.length) out.cls = 'erro';
    else if (out.candidates.length && !out.partyId) out.cls = 'revisar';
    else if (out.partyId) out.cls = !out.financial && out.importKey && Object.keys(out.updates).length === 0 && !out.newRegistration ? 'duplicado' : 'vinculado';
    else if (!opts.createParties) { out.cls = 'erro'; errors.push('Cadastro não encontrado e a criação de novos cadastros está desativada.'); }
    else if (!r.name) { out.cls = 'erro'; errors.push('Cadastro não encontrado: o nome é necessário para criar um novo.'); }
    else if (!r.ie && !r.document) { out.cls = 'revisar'; warnings.push('Sem IE ou CPF/CNPJ: confirme a criação de um cadastro só com o nome.'); }
    else out.cls = 'novo';
    if (out.cls === 'novo' && out.importKey && !out.financial && warnings.some((w) => w.includes('já importado'))) out.cls = 'duplicado';
    return out;
  });
}

export function summarize(rows: AnalyzedRow[]) {
  const count = (c: RowClass) => rows.filter((r) => r.cls === c).length;
  return {
    total: rows.length, novo: count('novo'), vinculado: count('vinculado'), revisar: count('revisar'), duplicado: count('duplicado'), erro: count('erro'),
    financial: rows.filter((r) => r.financial && r.cls !== 'erro').length,
    amount: round2(rows.filter((r) => r.financial && r.cls !== 'erro').reduce((a, r) => a + (r.amount ?? 0), 0)),
  };
}

/** CSV (;) com as linhas não importadas e o motivo — para o relatório de erros. */
export function errorsCsv(rows: { rowNumber: number; cls: string; errors?: string[]; warnings?: string[]; message?: string | null; raw: Record<string, unknown> }[]): string {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r.raw))));
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Linha', 'Situação', 'Motivo', ...headers].map(esc).join(';')];
  for (const r of rows) {
    const reason = r.message ?? [...(r.errors ?? []), ...(r.warnings ?? [])].join(' | ');
    lines.push([r.rowNumber, r.cls, reason, ...headers.map((h) => r.raw[h])].map(esc).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
