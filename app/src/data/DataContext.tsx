import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import type { TableName } from '../lib/types';
import type { Row } from './source';

const VersionCtx = createContext<{ version: number; bump(): void }>({ version: 0, bump: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return <VersionCtx.Provider value={{ version, bump }}>{children}</VersionCtx.Provider>;
}

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
