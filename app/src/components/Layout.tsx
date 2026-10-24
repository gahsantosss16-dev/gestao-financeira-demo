import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../lib/types';
import { useFeedback } from './Feedback';
import { BrandLogo } from './Brand';
import { Icon } from './Icon';
import { UserMenu } from './UserMenu';

interface NavItem { to: string; label: string; icon: string; roles?: Role[]; stage?: string }
const NAV: { label: string; items: NavItem[] }[] = [
  { label: 'Visão geral', items: [{ to: '/', label: 'Painel financeiro', icon: 'dashboard' }] },
  { label: 'Financeiro', items: [
    { to: '/receber', label: 'Contas a receber', icon: 'in' },
    { to: '/pagar', label: 'Contas a pagar', icon: 'out' },
    { to: '/cobrancas', label: 'Cobranças', icon: 'send' },
  ] },
  { label: 'Cadastros', items: [
    { to: '/cadastros/pessoas', label: 'Clientes e fornecedores', icon: 'users' },
    { to: '/cadastros/categorias', label: 'Categorias', icon: 'tag' },
    { to: '/cadastros/servicos', label: 'Serviços', icon: 'briefcase' },
  ] },
  { label: 'Fiscal', items: [
    { to: '/fiscal/notas', label: 'Notas fiscais (NFS-e)', icon: 'file' },
    { to: '/fiscal/configuracao', label: 'Dados fiscais', icon: 'settings', roles: ['admin', 'fiscal', 'financeiro'] },
  ] },
  { label: 'Importação', items: [
    { to: '/importacao', label: 'Importar planilhas', icon: 'upload', roles: ['admin', 'financeiro'] },
  ] },
  { label: 'Próximas etapas', items: [
    { to: '/relatorios', label: 'Relatórios', icon: 'chart', stage: 'Em breve' },
  ] },
  { label: 'Administração', items: [
    { to: '/admin/usuarios', label: 'Usuários e perfis', icon: 'shield', roles: ['admin'] },
    { to: '/admin/auditoria', label: 'Auditoria', icon: 'history', roles: ['admin'] },
  ] },
];
const BOTTOM: NavItem[] = [
  { to: '/', label: 'Painel', icon: 'dashboard' },
  { to: '/receber', label: 'Receber', icon: 'in' },
  { to: '/pagar', label: 'Pagar', icon: 'out' },
  { to: '/cadastros/pessoas', label: 'Cadastros', icon: 'users' },
  { to: '/fiscal/notas', label: 'Fiscal', icon: 'file' },
];

const THEME_KEY = 'associapec-theme';
const SIDEBAR_KEY = 'associapec-sidebar-recolhida';

export function Layout() {
  const { profile, mode, resetDemo } = useAuth();
  const { confirm, toast } = useFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  // menu lateral recolhido (somente telas largas); preferência do próprio navegador
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((v) => { try { localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1'); } catch { /* ignora */ } return !v; });
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    try { const t = localStorage.getItem(THEME_KEY); if (t) document.documentElement.dataset.theme = t; } catch { /* ignora */ }
  }, []);

  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignora */ }
  };

  const onReset = async () => {
    if (await confirm({ title: 'Restaurar dados de demonstração', message: 'Todas as alterações feitas nesta demonstração serão descartadas.', confirmLabel: 'Restaurar', danger: true })) {
      resetDemo();
      toast('Dados de demonstração restaurados.');
      setTimeout(() => window.location.reload(), 400);
    }
  };

  const visible = (i: NavItem) => !i.roles || (profile && i.roles.includes(profile.role));

  return (
    <div className={`${mode === 'demo' ? 'with-banner' : ''} ${menuOpen ? 'menu-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mode === 'demo' && (
        <div className="demo-banner" role="note">
          <strong>DEMONSTRAÇÃO</strong>
          <span>Dados fictícios no seu navegador · sem conexão com o Supabase · nenhuma nota fiscal é emitida</span>
          <button className="demo-reset" type="button" onClick={onReset}>Restaurar dados</button>
        </div>
      )}
      <div className="app">
        <aside className="sidebar" aria-label="Menu principal">
          <NavLink className="brand-link" to="/" aria-label="ASSOCIAPEC — Painel financeiro">
            <span className="brand-full"><BrandLogo /></span>
            <span className="brand-symbol"><BrandLogo variant="symbol" /></span>
          </NavLink>
          <nav className="nav">
            {NAV.map((sec) => {
              const items = sec.items.filter(visible);
              if (!items.length) return null;
              return (
                <div key={sec.label}>
                  <div className="nav-label">{sec.label}</div>
                  {items.map((i) => (
                    <NavLink key={i.to} to={i.to} end={i.to === '/'} title={collapsed ? i.label : undefined} aria-label={i.label} className={({ isActive }) => (isActive ? 'active' : '')}>
                      <Icon name={i.icon} /><span className="nav-text">{i.label}</span>
                      {i.stage && <span className="pill soft">{i.stage}</span>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} aria-pressed={collapsed} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></svg>
            <span className="nav-text">{collapsed ? 'Expandir menu' : 'Recolher menu'}</span>
          </button>
        </aside>
        <div className="scrim" onClick={() => setMenuOpen(false)} />
        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
            <span className={`env-chip ${mode}`} title="Ambiente fiscal">
              <Icon name={mode === 'demo' ? 'info' : 'lock'} />
              {mode === 'demo' ? 'Modo demonstração' : 'NFS-e: homologação'}
            </span>
            <div className="topbar-actions">
              <button className="icon-btn" type="button" aria-label="Alternar tema claro/escuro" onClick={toggleTheme}><Icon name="moon" /></button>
              <UserMenu />
            </div>
          </header>
          <main className="view" id="conteudo" tabIndex={-1}><Outlet /></main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Navegação rápida">
        {BOTTOM.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={i.icon} />{i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
