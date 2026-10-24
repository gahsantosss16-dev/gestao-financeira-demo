import { createClient } from "@supabase/supabase-js";

// Somente a chave PÚBLICA (anon/publishable) vai para o navegador. A
// service_role é bloqueada no build por scripts/assert-supabase-target.mjs.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigurado = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(supabaseUrl || "http://localhost:54321", supabaseKey || "nao-configurado", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const ambiente = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "development";
