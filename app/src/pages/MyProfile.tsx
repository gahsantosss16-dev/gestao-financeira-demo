import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MIN_LENGTH } from '../auth/authRedirect';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { TextInput } from '../components/TextInput';
import { getInitials } from '../components/UserMenu';
import { Callout, Field, PageHead } from '../components/ui';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../lib/permissions';

export function MyProfile() {
  const { profile, mode, updateMyName, changePassword, signOut } = useAuth();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  if (!profile) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try { await updateMyName(name); toast('Nome atualizado.'); }
    catch (err) { toast((err as Error).message, 'error'); }
    finally { setSavingName(false); }
  };
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next, pw.confirm);
      setPw({ current: '', next: '', confirm: '' });
      toast('Senha alterada com sucesso.');
    } catch (err) { setPwError((err as Error).message); }
    finally { setSavingPw(false); }
  };

  return (
    <>
      <PageHead title="Meu Perfil" subtitle="Seus dados de acesso ao Financeiro ASSOCIAPEC" />
      <div className="grid g-1-1">
        <form className="card card-pad stack" onSubmit={saveName} noValidate>
          <div className="profile">
            <span className="avatar lg">{getInitials(profile.full_name || profile.email || '?')}</span>
            <div><h2>{profile.full_name || 'Sem nome'}</h2><div className="muted">{profile.email}</div></div>
          </div>
          <Field label="Nome"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <Field label="E-mail" hint="O e-mail de acesso é alterado pelo administrador"><TextInput value={profile.email ?? ''} disabled /></Field>
          <Field label="Perfil de acesso" hint="Somente um administrador pode alterar o perfil">
            <TextInput value={`${ROLE_LABEL[profile.role]} — ${ROLE_DESCRIPTION[profile.role]}`} disabled />
          </Field>
          <div className="row">
            <button className="btn primary" type="submit" disabled={savingName || name.trim() === profile.full_name}>{savingName ? 'Salvando…' : 'Salvar nome'}</button>
            <span className="spacer" />
            <button className="btn" type="button" onClick={async () => { if (await confirm({ title: 'Encerrar sessão?', message: 'Você precisará entrar novamente para acessar o sistema.', confirmLabel: 'Sair' })) await signOut(); }}><Icon name="logout" />Encerrar sessão</button>
          </div>
        </form>
        <form className="card card-pad stack" onSubmit={savePassword} noValidate>
          <h3>Alterar senha</h3>
          {mode === 'demo' ? <Callout tone="info">No modo demonstração não há senha. Com o Supabase conectado, a troca exige a senha atual.</Callout> : <>
            {pwError && <Callout tone="danger" icon="alert">{pwError}</Callout>}
            <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="Nova senha" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, com letras e números`}><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Confirme a nova senha"><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <div className="row"><button className="btn primary" type="submit" disabled={savingPw || !pw.current || !pw.next}>{savingPw ? 'Alterando…' : 'Alterar senha'}</button></div>
          </>}
        </form>
      </div>
    </>
  );
}
