import type { Attachment, FiscalEnv, Profile, TableName, Tables } from '../lib/types';

export type Row<T extends TableName> = Tables[T];

export interface FiscalCallResult {
  status: 'ok' | 'nao_habilitado' | 'nao_implementado' | 'erro' | 'erro_prefeitura';
  message?: string;
  httpStatus?: number;
  body?: string;
}

/** Contrato único de acesso a dados. Implementado pelo Supabase e pelo modo demonstração. */
export interface DataSource {
  readonly mode: 'supabase' | 'demo';
  list<T extends TableName>(table: T): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>>;
  update<T extends TableName>(table: T, key: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  remove(table: TableName, key: string): Promise<void>;
  uploadAttachment(entity: Attachment['entity'], entityId: string, file: File): Promise<Attachment>;
  attachmentUrl(att: Attachment): Promise<string>;
  /**
   * Versão do banco: 1 = migração fundacao; 2 = migração operacional aplicada
   * (estorno com justificativa, cobranças, inscrições estaduais, importação).
   */
  schemaVersion(): Promise<1 | 2>;
  callFiscal(action: 'emitir' | 'consultar_nfse' | 'consultar_dps' | 'evento', payload: { environment: FiscalEnv; documentId?: string; chaveAcesso?: string; dpsId?: string }): Promise<FiscalCallResult>;
}

export interface AuthSession {
  profile: Profile;
}

export const KEY_FIELD: Partial<Record<TableName, string>> = { fiscal_issuer: 'environment' };
export const keyOf = (table: TableName) => KEY_FIELD[table] ?? 'id';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export function checkAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Arquivo maior que 10 MB.';
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return 'Formato não permitido (use PDF, PNG, JPG ou WEBP).';
  return null;
}

/** Mensagens claras para violações de unicidade (nome da constraint → texto). */
export const UNIQUE_MESSAGES: Record<string, string> = {
  parties_document_uniq: 'Já existe um cadastro com este CPF/CNPJ.',
  party_registrations_uf_ie_key: 'Esta inscrição estadual já está cadastrada nesta UF.',
  party_registrations_primary_uniq: 'O cadastro já possui uma inscrição principal.',
  charges_active_receivable_uniq: 'Já existe uma cobrança ativa para esta conta a receber.',
  receivable_payments_client_request_id_key: 'Este recebimento já foi registrado (envio repetido ignorado).',
  payable_payments_client_request_id_key: 'Este pagamento já foi registrado (envio repetido ignorado).',
  receivables_import_key_uniq: 'Este lançamento já foi importado anteriormente.',
  categories_name_ci_uniq: 'Já existe uma categoria com este nome.',
  categories_type_name_key: 'Já existe uma categoria com este nome.',
  services_name_ci_uniq: 'Já existe um serviço com este nome.',
  payables_recurrence_uniq: 'Esta ocorrência recorrente já foi gerada.',
};
export function duplicateMessage(text: string): string {
  const found = Object.keys(UNIQUE_MESSAGES).find((k) => text.includes(k));
  return found ? UNIQUE_MESSAGES[found] : 'Registro duplicado (já existe um cadastro com estes dados).';
}
