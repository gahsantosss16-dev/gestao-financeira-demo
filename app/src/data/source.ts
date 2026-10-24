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
