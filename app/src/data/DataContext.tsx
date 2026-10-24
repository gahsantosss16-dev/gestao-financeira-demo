import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import type { TableName } from '../lib/types';
import type { Row } from './source';

const VersionCtx = createContext<{ version: number; bump(): void }>({ version: 0, bump: () => {} });
/** null enquanto verifica; 1 = só a migração fundacao; 2 = migração operacional aplicada */
const SchemaCtx = createContext<1 | 2 | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { source, profile } = useAuth();
  const [version, setVersion] = useState(0);
  const [schema, setSchema] = useState<1 | 2 | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    source.schemaVersion().then((v) => { if (alive) setSchema(v); }).catch(() => { if (alive) setSchema(1); });
    return () => { alive = false; };
  }, [source, profile]);
  return (
    <VersionCtx.Provider value={{ version, bump }}>
      <SchemaCtx.Provider value={schema}>{children}</SchemaCtx.Provider>
    </VersionCtx.Provider>
  );
}

/** true quando o banco já tem a migração operacional (cobranças, IE, estornos, importação). */
export function useSchemaV2() {
  return useContext(SchemaCtx) === 2;
}
export const useSchemaVersion = () => useContext(SchemaCtx);

/** Carrega uma tabela e recarrega automaticamente após qualquer alteração. */
export function useTable<T extends TableName>(table: T, enabled = true) {
  const { source, profile } = useAuth();
  const { version } = useContext(VersionCtx);
  const [rows, setRows] = useState<Row<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !profile) { setLoading(false); return; }
    let alive = true;
    source.list(table)
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [source, table, version, enabled, profile]);

  return { rows, loading, error };
}

/** Executa uma operação de escrita com feedback visual e atualização das telas. */
export function useMutation() {
  const { source } = useAuth();
  const { bump } = useContext(VersionCtx);
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <R,>(fn: (s: typeof source) => Promise<R>, success?: string): Promise<R | undefined> => {
    setBusy(true);
    try {
      const result = await fn(source);
      if (success) toast(success);
      return result;
    } catch (e) {
      toast((e as Error).message || 'Não foi possível concluir a operação.', 'error');
      return undefined;
    } finally {
      setBusy(false);
      bump();
    }
  }, [source, bump, toast]);
  return { run, busy, source };
}
