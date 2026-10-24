import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MIN_LENGTH, validatePassword } from '../auth/authRedirect';
import { useFeedback } from '../components/Feedback';
import { BrandLogo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Callout } from '../components/ui';

interface FormProps {
  email: string | null;
  initialName: string;
  onSubmit(password: string, confirm: string, name: string): Promise<void>;
  onCancel(): void;
}

/** Formulário puro (testável sem Supabase). */
export function SetPasswordForm({ email, initialName, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validatePassword(password, confirm);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    setError(null);
    try { await onSubmit(password, confirm, name); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const rules = [
    { ok: password.length >= PASSWORD_MIN_LENGTH, label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
    { ok: /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password), label: 'Letras e números' },
    { ok: !!password && password === confirm, label: 'Confirmação igual à senha' },
  ];

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <h1 className="login-title">Defina sua senha</h1>
      <p className="muted">Bem-vindo(a) ao Financeiro ASSOCIAPEC{email ? <> — <b>{email}</b></> : null}. Crie a senha que você usará para entrar no sistema.</p>
      {error && <Callout tone="danger" icon="alert">{error}</Callout>}
      <div className="field"><label>Seu nome<input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label></div>
      <div className="field"><label>Nova senha<input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label></div>
      <div className="field"><label>Confirme a nova senha<input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label></div>
      <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Mostrar senha</label>
      <ul className="issues">
        {rules.map((r) => <li key={r.label} className={r.ok ? 'ok' : 'aviso'}><Icon name={r.ok ? 'check' : 'info'} />{r.label}</li>)}
      </ul>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha e entrar'}</button>
      <button className="btn ghost" type="button" onClick={onCancel}>Sair</button>
    </form>
  );
}

export function SetPassword() {
  const { profile, completePasswordSetup, signOut } = useAuth();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-logo"><BrandLogo variant="login" /></div>
        <SetPasswordForm
          email={profile?.email ?? null}
          initialName={profile?.full_name ?? ''}
          onSubmit={async (password, confirm, name) => {
            await completePasswordSetup(password, confirm, name);
            toast('Senha definida com sucesso.');
            navigate('/', { replace: true });
          }}
          onCancel={() => signOut()}
        />
      </div>
    </div>
  );
}
