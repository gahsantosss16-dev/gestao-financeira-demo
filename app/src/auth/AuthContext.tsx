import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DemoSource } from '../data/demoSource';
import { DEMO_USERS } from '../data/demoSeed';
import type { DataSource } from '../data/source';
import { SupabaseSource, supabase, supabaseConfigured } from '../data/supabaseSource';
import type { Profile } from '../lib/types';
import { appBaseUrl, describeAuthError, requiresPasswordSetup, takePendingAuthRedirect, validatePassword } from './authRedirect';

interface AuthState {
  mode: 'supabase' | 'demo';
  source: DataSource;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** true após abrir um link de convite ou de recuperação: a senha precisa ser definida */
  passwordSetupRequired: boolean;
  signIn(email: string, password: string): Promise<void>;
  signInDemo(userId: string): void;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  completePasswordSetup(password: string, confirm: string, fullName: string): Promise<void>;
  resetDemo(): void;
}

const Ctx = createContext<AuthState | null>(null);
const DEMO_SESSION_KEY = 'associapec-demo-session';
const PASSWORD_SETUP_KEY = 'associapec-password-setup';

const demoSource = supabaseConfigured ? null : new DemoSource();
const source: DataSource = supabase ? new SupabaseSource(supabase) : demoSource!;

const readFlag = () => { try { return sessionStorage.getItem(PASSWORD_SETUP_KEY) === '1'; } catch { return false; } };
const writeFlag = (on: boolean) => {
  try { if (on) sessionStorage.setItem(PASSWORD_SETUP_KEY, '1'); else sessionStorage.removeItem(PASSWORD_SETUP_KEY); } catch { /* ignora */ }
};

/**
 * Processa (uma única vez por carregamento) o retorno de um link de e-mail:
 * cria a sessão com os tokens recebidos ou devolve a mensagem de erro.
 */
let bootstrap: Promise<{ error: string | null; passwordSetup: boolean }> | null = null;
function handleAuthRedirect() {
  bootstrap ??= (async () => {
    const pending = takePendingAuthRedirect();
    if (!pending || !supabase) return { error: null, passwordSetup: false };
    if (pending.kind === 'error') return { error: describeAuthError(pending), passwordSetup: false };
    const invalid = () => {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#/`);
      return { error: 'O link recebido não é mais válido. Clique em “Esqueci minha senha” para receber um novo.', passwordSetup: false };
    };
    try {
      // supabase-js lança exceção (em vez de devolver erro) para tokens malformados
      const { error } = await supabase.auth.setSession({ access_token: pending.accessToken, refresh_token: pending.refreshToken });
      if (error) return invalid();
    } catch {
      return invalid();
    }
    return { error: null, passwordSetup: requiresPasswordSetup(pending) };
  })();
  return bootstrap;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(readFlag);

  const setPasswordSetup = useCallback((on: boolean) => { writeFlag(on); setPasswordSetupRequired(on); }, []);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!supabase || !userId) { setProfile(null); return; }
    const { data, error: err } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (err || !data) {
      setError('Perfil de acesso não encontrado. Procure o administrador do sistema.');
      setProfile(null);
    } else if (!data.active) {
      setError('Seu usuário está desativado. Procure o administrador do sistema.');
      await supabase.auth.signOut();
      setProfile(null);
    } else {
      setError(null);
      setProfile(data as Profile);
    }
  }, []);

  useEffect(() => {
    if (demoSource) {
      takePendingAuthRedirect(); // links do Supabase não se aplicam ao modo demonstração
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(DEMO_SESSION_KEY); } catch { /* ignora */ }
      const user = DEMO_USERS.find((u) => u.id === saved) ?? null;
      demoSource.user = user;
      setProfile(user);
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const result = await handleAuthRedirect();
        if (result.passwordSetup) setPasswordSetup(true);
        const { data } = await supabase!.auth.getSession();
        if (!alive) return;
        await loadProfile(data.session?.user.id);
        if (result.error) setError(result.error);
      } catch {
        if (alive) setError('Não foi possível conectar ao servidor de autenticação. Tente novamente.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const { data: sub } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setPasswordSetup(false);
      if (event === 'PASSWORD_RECOVERY') setPasswordSetup(true);
      // adiado para fora do callback, conforme recomendação do supabase-js
      setTimeout(() => loadProfile(session?.user.id), 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile, setPasswordSetup]);

  const value = useMemo<AuthState>(() => ({
    mode: source.mode,
    source,
    profile,
    loading,
    error,
    passwordSetupRequired: passwordSetupRequired && !!profile && source.mode === 'supabase',
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase não configurado');
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw new Error(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
    },
    signInDemo(userId) {
      const user = DEMO_USERS.find((u) => u.id === userId) ?? null;
      demoSource!.user = user;
      try { sessionStorage.setItem(DEMO_SESSION_KEY, userId); } catch { /* ignora */ }
      setProfile(user);
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      if (demoSource) {
        demoSource.user = null;
        try { sessionStorage.removeItem(DEMO_SESSION_KEY); } catch { /* ignora */ }
      }
      setPasswordSetup(false);
      setProfile(null);
    },
    async resetPassword(email) {
      if (!supabase) throw new Error('Supabase não configurado');
      // volta para o endereço atual do app (localhost em desenvolvimento, domínio próprio depois)
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() });
      if (err) throw new Error(err.message);
    },
    async completePasswordSetup(password, confirm, fullName) {
      if (!supabase || !profile) throw new Error('Sessão expirada. Abra novamente o link recebido por e-mail.');
      const invalid = validatePassword(password, confirm);
      if (invalid) throw new Error(invalid);
      const name = fullName.trim();
      const { error: err } = await supabase.auth.updateUser({ password, ...(name ? { data: { full_name: name } } : {}) });
      if (err) {
        if (/should be different/i.test(err.message)) throw new Error('A nova senha deve ser diferente da anterior.');
        if (/weak|at least/i.test(err.message)) throw new Error('Senha recusada pelo servidor por ser fraca. Escolha uma senha mais forte.');
        throw new Error(err.message);
      }
      if (name && name !== profile.full_name) {
        // RLS permite ao usuário alterar o próprio nome (papel e situação continuam protegidos)
        await supabase.from('profiles').update({ full_name: name }).eq('id', profile.id);
        setProfile({ ...profile, full_name: name });
      }
      setPasswordSetup(false);
    },
    resetDemo() { demoSource?.reset(); },
  }), [profile, loading, error, passwordSetupRequired, setPasswordSetup]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
