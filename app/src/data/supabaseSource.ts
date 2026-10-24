import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, TableName } from '../lib/types';
import { checkAttachment, duplicateMessage, keyOf, type DataSource, type FiscalCallResult, type Row } from './source';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && anonKey);
// detectSessionInUrl desativado: o retorno dos links de e-mail é tratado em auth/authRedirect.ts,
// pois o app usa rotas por hash e os tokens também chegam no fragmento da URL.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, { auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } })
  : null;

const ORDER: Partial<Record<TableName, { column: string; ascending: boolean }>> = {
  audit_log: { column: 'at', ascending: false },
  nfse_requests: { column: 'created_at', ascending: false },
  receivables: { column: 'due_date', ascending: true },
  payables: { column: 'due_date', ascending: true },
  charges: { column: 'created_at', ascending: false },
  import_batches: { column: 'created_at', ascending: false },
  import_rows: { column: 'row_number', ascending: true },
};

function fail(error: { message: string; code?: string; details?: string } | null): never {
  const msg = error?.message || 'Erro desconhecido';
  if (error?.code === '42501' || /row-level security/i.test(msg)) throw new Error('Seu perfil não tem permissão para esta operação.');
  if (error?.code === '23505') throw new Error(duplicateMessage(`${msg} ${error.details ?? ''}`));
  if (error?.code === '23514') throw new Error('Dados inválidos para este registro. Revise os campos.');
  throw new Error(msg);
}

let cachedVersion: Promise<1 | 2> | null = null;

export class SupabaseSource implements DataSource {
  readonly mode = 'supabase' as const;
  constructor(private client: SupabaseClient) {}

  async list<T extends TableName>(table: T) {
    let q = this.client.from(table).select('*');
    const o = ORDER[table];
    if (o) q = q.order(o.column, { ascending: o.ascending });
    if (table === 'audit_log' || table === 'nfse_requests') q = q.limit(500);
    if (table === 'import_rows') q = q.limit(20000);
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []) as Row<T>[];
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>) {
    const { data, error } = await this.client.from(table).insert(row as never).select().single();
    if (error) fail(error);
    return data as Row<T>;
  }

  async update<T extends TableName>(table: T, key: string, patch: Partial<Row<T>>) {
    const { data, error } = await this.client.from(table).update(patch as never).eq(keyOf(table), key).select().maybeSingle();
    if (error) fail(error);
    if (!data) throw new Error('Seu perfil não tem permissão para esta operação.');
    return data as Row<T>;
  }

  async remove(table: TableName, key: string) {
    const { error, count } = await this.client.from(table).delete({ count: 'exact' }).eq(keyOf(table), key);
    if (error) fail(error);
    if (!count) throw new Error('Seu perfil não tem permissão para excluir este registro.');
  }

  async uploadAttachment(entity: Attachment['entity'], entityId: string, file: File) {
    const problem = checkAttachment(file);
    if (problem) throw new Error(problem);
    const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${entity}/${entityId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await this.client.storage.from('comprovantes').upload(path, file, { contentType: file.type });
    if (error) fail(error);
    return this.insert('attachments', {
      entity, entity_id: entityId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
    });
  }

  async attachmentUrl(att: Attachment) {
    // URL assinada e temporária: o bucket é privado
    const { data, error } = await this.client.storage.from('comprovantes').createSignedUrl(att.storage_path, 120);
    if (error) fail(error);
    return data.signedUrl;
  }

  schemaVersion() {
    cachedVersion ??= (async () => {
      // a tabela de cobranças só existe após a migração operacional
      const { error } = await this.client.from('charges').select('id', { head: true, count: 'exact' }).limit(1);
      return error && (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) ? 1 : 2;
    })();
    return cachedVersion;
  }

  async callFiscal(action: Parameters<DataSource['callFiscal']>[0], payload: Parameters<DataSource['callFiscal']>[1]): Promise<FiscalCallResult> {
    const { data, error } = await this.client.functions.invoke('nfse', { body: { action, ...payload } });
    if (data) return data as FiscalCallResult;
    // a função responde 4xx/5xx com JSON explicativo
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try { return (await ctx.json()) as FiscalCallResult; } catch { /* segue */ }
    }
    return { status: 'erro' as const, message: error?.message || 'Falha ao chamar o backend fiscal' };
  }
}
