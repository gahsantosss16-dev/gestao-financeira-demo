import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BrandLogo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Callout } from '../components/ui';
import { DEMO_USERS } from '../data/demoSeed';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../lib/permissions';

export function Login() {
  const { mode, signIn, signInDemo, resetPassword, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: string; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try { await signIn(email.trim(), password); }
    catch (err) { setMessage({ tone: 'danger', text: (err as Error).message }); }
    finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!email.trim()) { setMessage({ tone: 'warning', text: 'Informe seu e-mail para receber o link de redefinição.' }); return; }
    try { await resetPassword(email.trim()); setMessage({ tone: 'success', text: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' }); }
    catch (err) { setMessage({ tone: 'danger', text: (err as Error).message }); }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-aside" aria-hidden="true">
          <div className="login-aside-inner">
            <span className="login-kicker">Financeiro ASSOCIAPEC</span>
            <h2>Cadastros, cobranças e recebimentos dos associados em um só lugar.</h2>
            <ul>
              <li><Icon name="shield" />Acesso por perfil e dados protegidos</li>
              <li><Icon name="upload" />Importação das planilhas mensais</li>
              <li><Icon name="chart" />Painel financeiro em tempo real</li>
            </ul>
          </div>
        </aside>
      <div className="login-card card">
        <div className="login-logo"><BrandLogo variant="login" /></div>
        {mode === 'supabase' ? (
          <form onSubmit={submit} className="stack" noValidate>
            <h1 className="login-title">Acesse sua conta</h1>
            <p className="muted small login-sub"><Icon name="lock" className="inline-ico" /> Área restrita a usuários autorizados</p>
            {(message || error) && <Callout tone={message?.tone ?? 'danger'} icon="info">{message?.text ?? error}</Callout>}
            <div className="field"><label>E-mail<input className="input input-lg" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com.br" /></label></div>
            <div className="field"><label>Senha<input className="input input-lg" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label></div>
            <button className="btn primary btn-lg" type="submit" disabled={busy || !email || !password}>{busy ? <><span className="spinner sm" aria-hidden="true" />Entrando…</> : 'Entrar'}</button>
            <button className="btn ghost" type="button" onClick={forgot}>Esqueci minha senha</button>
            <p className="muted small">O acesso é criado pelo administrador. Não há cadastro público.</p>
          </form>
        ) : (
          <div className="stack">
            <h1 className="login-title">Modo demonstração</h1>
            <Callout tone="warning" icon="info">
              O Supabase ainda não foi conectado. Os dados são <b>fictícios</b> e ficam apenas neste navegador.
              Escolha um perfil para conhecer as permissões de cada tipo de usuário.
            </Callout>
            <div className="role-list">
              {DEMO_USERS.map((u) => (
                <button key={u.id} type="button" className="role-option" onClick={() => signInDemo(u.id)}>
                  <span className="avatar sm">{u.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                  <span className="grow-min"><b>{ROLE_LABEL[u.role]}</b><small>{ROLE_DESCRIPTION[u.role]}</small></span>
                  <Icon name="logout" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      <p className="login-foot">ASSOCIAPEC · Associação de Pecuaristas de Fazendas Certificadas</p>
    </div>
  );
}
