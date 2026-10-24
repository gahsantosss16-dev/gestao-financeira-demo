import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { loginDestination } from "@/lib/redirects";
import { supabase } from "@/lib/supabase";

export function LoginPage({ redirect }: { redirect?: string }) {
  const { status, sair } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (status === "autenticado") void navigate({ to: loginDestination(redirect), replace: true });
  }, [status, redirect, navigate]);

  async function entrar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    // Mensagem única: não revela se o e-mail existe.
    if (error) setErro("E-mail ou senha inválidos.");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-dark p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">ASSOCIAPEC Financeiro</h1>
        <p className="mb-5 text-sm text-muted-foreground">Acesso restrito à equipe autorizada.</p>
        {status === "nao_configurado" ? (
          <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            Supabase não configurado neste ambiente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).
          </p>
        ) : status === "bloqueado" ? (
          <div role="alert" className="space-y-3 text-sm">
            <p className="rounded-lg bg-warning-soft p-3 text-warning">
              Sua conta ainda não foi liberada por um administrador.
            </p>
            <Button variant="outline" onClick={() => void sair()}>
              Usar outra conta
            </Button>
          </div>
        ) : (
          <form onSubmit={entrar} className="space-y-4">
            <Field label="E-mail" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Senha" htmlFor="senha" error={erro}>
              <Input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={enviando || status === "carregando"}>
              {enviando ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
