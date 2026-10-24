import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, TableName } from '../lib/types';
import { checkAttachment, keyOf, type DataSource, type FiscalCallResult, type Row } from './source';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && anonKey);
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, anonKey!) : null;

const ORDER: Partial<Record<TableName, { column: string; ascending: boolean }>> = {
  audit_log: { column: 'at', ascending: false },
  nfse_requests: { column: 'created_at', ascending: false },
  receivables: { column: 'due_date', ascending: true },
  payables: { column: 'due_date', ascending: true },
};

function fail(error: { message: string; code?: string } | null): never {
  const msg = error?.message || 'Erro desconhecido';
  if (error?.code === '42501' || /row-level security/i.test(msg)) throw new Error('Seu perfil não tem permissão para esta operação.');
  if (error?.code === '23505') throw new Error('Registro duplicado (já existe um cadastro com estes dados).');
  throw new Error(msg);
}

export class SupabaseSource implements DataSource {
  readonly mode = 'supabase' as const;
  constructor(private client: SupabaseClient) {}

  async list<T extends TableName>(table: T) {
    let q = this.client.from(table).select('*');
    const o = ORDER[table];
    if (o) q = q.order(o.column, { ascending: o.ascending });
    if (table === 'audit_log' || table === 'nfse_requests') q = q.limit(500);
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []) as Row<T>[];
  }

  async insert<T extends TableName>(table: T, row: Partial<Row<T>>) {
    const { data, error } = await this.client.from(table).insert(row).select().single();
    if (error) fail(error);
    return data as Row<T>;
  }

  async update<T extends TableName>(table: T, key: string, patch: Partial<Row<T>>) {
    const { data, error } = await this.client.from(table).update(patch).eq(keyOf(table), key).select().maybeSingle();
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
