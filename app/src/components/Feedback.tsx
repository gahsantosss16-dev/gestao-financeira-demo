import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

type ToastKind = 'ok' | 'error' | 'info';
interface ConfirmOptions { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }
interface FeedbackApi {
  toast(message: string, kind?: ToastKind): void;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const seq = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setPending(opts);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);
  const close = (v: boolean) => { resolver.current?.(v); setPending(null); };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {pending && (
        <Modal
          title={pending.title}
          onClose={() => close(false)}
          footer={<>
            <button className="btn" type="button" onClick={() => close(false)}>Cancelar</button>
            <button className={`btn ${pending.danger ? 'danger-solid' : 'primary'}`} type="button" autoFocus onClick={() => close(true)}>
              {pending.confirmLabel ?? 'Confirmar'}
            </button>
          </>}
        >
          <div className="confirm-body">{pending.message}</div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeedback fora do FeedbackProvider');
  return ctx;
}
