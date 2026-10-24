// Menu do usuário na Topbar — mesmo padrão do Neuro Hub Pro (layout/Topbar.tsx):
// avatar com iniciais, nome e perfil; menu com Meu Perfil e Sair.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/permissions';
import { Icon } from './Icon';

/** Iniciais: primeira letra do primeiro e do último nome (Neuro Hub Pro). */
export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

export function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = profile?.full_name || profile?.email || 'Usuário';
  const role = profile ? ROLE_LABEL[profile.role] : '';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.user-trigger')?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const idx = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await signOut(); navigate('/', { replace: true }); } finally { setLoggingOut(false); }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={`Menu do usuário ${name}`} onClick={() => setOpen((v) => !v)}>
        <span className="avatar sm">{getInitials(name)}</span>
        <span className="user-id hide-sm"><b className="truncate">{name}</b><small>{role}</small></span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="chev"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="user-dropdown" role="menu" aria-label="Opções do usuário">
          <div className="user-head">
            <span className="avatar">{getInitials(name)}</span>
            <div className="grow-min"><b className="truncate">{name}</b><small className="truncate">{profile?.email}</small><span className="badge tone-primary plain">{role}</span></div>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/meu-perfil'); }}><Icon name="users" />Meu Perfil</button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="danger" onClick={logout} disabled={loggingOut}><Icon name="logout" />{loggingOut ? 'Encerrando sessão…' : 'Sair'}</button>
        </div>
      )}
    </div>
  );
}
