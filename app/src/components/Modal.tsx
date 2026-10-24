import { useEffect, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** quando informado, o corpo vira um <form> (Enter envia) */
  onSubmit?(e: FormEvent<HTMLFormElement>): void;
}

export function Modal({ title, onClose, children, footer, wide, onSubmit }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inner = <>
    <div className="modal-head">
      <h3>{title}</h3>
      <button className="icon-btn" type="button" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button>
    </div>
    <div className="modal-body">{children}</div>
    {footer && <div className="modal-foot">{footer}</div>}
  </>;

  return (
    <div className="modal-root">
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {onSubmit
          ? <form className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} noValidate
              onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>{inner}</form>
          : <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>{inner}</div>}
      </div>
    </div>
  );
}
