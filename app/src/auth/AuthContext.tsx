import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DemoSource } from '../data/demoSource';
import { DEMO_USERS } from '../data/demoSeed';
import type { DataSource } from '../data/source';
import { SupabaseSource, supabase, supabaseConfigured } from '../data/supabaseSource';
import type { Profile } from '../lib/types';

interface AuthState {
  mode: 'supabase' | 'demo';
  source: DataSource;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signInDemo(userId: string): void;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resetDemo(): void;
}

const Ctx = createContext<AuthState | null>(null);
const DEMO_SESSION_KEY = 'associapec-demo-session';

const demoSource = supabaseConfigured ? null : new DemoSource();
const source: DataSource = supabase ? new SupabaseSource(supabase) : demoSource!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(DEMO_SESSION_KEY); } catch { /* ignora */ }
      const user = DEMO_USERS.find((u) => u.id === saved) ?? null;
      demoSource.user = user;
      setProfile(user);
      setLoading(false);
      return;
    }
    supabase!.auth.getSession().then(async ({ data }) => {
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, session) => {
      // adiado para fora do callback, conforme recomendação do supabase-js
      setTimeout(() => loadProfile(session?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => ({
    mode: source.mode,
    source,
    profile,
    loading,
    error,
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
      setProfile(null);
    },
    async resetPassword(email) {
      if (!supabase) throw new Error('Supabase não configurado');
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (err) throw new Error(err.message);
    },
    resetDemo() { demoSource?.reset(); },
  }), [profile, loading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
