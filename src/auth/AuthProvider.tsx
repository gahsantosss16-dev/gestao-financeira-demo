import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import type { Papel } from "./permissions";
import { clearLastActivity } from "./session-activity";

export type Perfil = { id: string; nome: string; email: string | null; papel: Papel; ativo: boolean };

type AuthState = {
  status: "carregando" | "anonimo" | "autenticado" | "bloqueado" | "nao_configurado";
  session: Session | null;
  perfil: Perfil | null;
  sair: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function carregarPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, papel, ativo")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Perfil | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>(supabaseConfigurado ? "carregando" : "nao_configurado");

  useEffect(() => {
    if (!supabaseConfigurado) return;
    let ativo = true;
    async function aplicar(next: Session | null) {
      if (!ativo) return;
      setSession(next);
      if (!next) {
        setPerfil(null);
        setStatus("anonimo");
        return;
      }
      try {
        const p = await carregarPerfil(next.user.id);
        if (!ativo) return;
        setPerfil(p);
        // Conta sem perfil ativo não entra: a RLS também bloquearia os dados.
        setStatus(p?.ativo ? "autenticado" : "bloqueado");
      } catch {
        if (ativo) setStatus("bloqueado");
      }
    }
    void supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Evita chamar o Supabase dentro do callback (recomendação do supabase-js).
      setTimeout(() => void aplicar(next), 0);
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const sair = useCallback(async () => {
    if (session) clearLastActivity(session.user.id);
    await supabase.auth.signOut();
  }, [session]);

  const value = useMemo(() => ({ status, session, perfil, sair }), [status, session, perfil, sair]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return ctx;
}
