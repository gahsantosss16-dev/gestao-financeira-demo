import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BarChart3, FileText, LayoutDashboard, LogOut, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { podeAcessar } from "@/auth/permissions";
import { ambiente } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Item = { to: string; search?: Record<string, string>; label: string; icon: LucideIcon; ativo: (p: string, s: string) => boolean };

const ITENS: Item[] = [
  { to: "/", label: "Painel", icon: LayoutDashboard, ativo: (p) => p === "/" },
  { to: "/lancamentos", search: { tipo: "receber" }, label: "A receber", icon: TrendingUp, ativo: (p, s) => p === "/lancamentos" && s.includes("receber") },
  { to: "/lancamentos", search: { tipo: "pagar" }, label: "A pagar", icon: TrendingDown, ativo: (p, s) => p === "/lancamentos" && s.includes("pagar") },
  { to: "/pessoas", label: "Pessoas", icon: Users, ativo: (p) => p.startsWith("/pessoas") },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, ativo: (p) => p.startsWith("/relatorios") },
  { to: "/nfse", label: "NFS-e", icon: FileText, ativo: (p) => p.startsWith("/nfse") },
];

const AMBIENTE_ROTULO: Record<string, string> = { development: "DESENVOLVIMENTO", qa: "QA / HOMOLOGAÇÃO" };

export function AppLayout() {
  const { perfil, sair } = useAuth();
  const location = useRouterState({ select: (s) => s.location });
  const search = location.searchStr ?? "";
  const itens = ITENS.filter((item) => perfil && podeAcessar(perfil.papel, item.to));
  const faixa = AMBIENTE_ROTULO[ambiente];

  return (
    <div className="min-h-dvh">
      {faixa ? (
        <div role="note" className="bg-warning-soft px-4 py-1 text-center text-xs font-semibold text-warning">
          Ambiente de {faixa} — não use dados reais
        </div>
      ) : null}
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-brand-dark text-white md:flex">
          <div className="px-5 py-5">
            <div className="text-lg font-bold">ASSOCIAPEC</div>
            <div className="text-xs text-white/70">Financeiro</div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Menu principal">
            {itens.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                search={item.search}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/85 hover:bg-white/10",
                  item.ativo(location.pathname, search) && "bg-white/15 font-semibold text-white",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 px-5 py-4 text-xs text-white/75">
            <div className="truncate font-medium text-white">{perfil?.nome || perfil?.email}</div>
            <div className="capitalize">{perfil?.papel}</div>
            <button type="button" onClick={() => void sair()} className="mt-2 inline-flex items-center gap-1 underline">
              <LogOut className="h-3 w-3" aria-hidden /> Sair
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
          <div className="mb-4 flex items-center justify-between md:hidden">
            <div className="font-bold text-brand-dark">ASSOCIAPEC Financeiro</div>
            <Button variant="ghost" size="sm" onClick={() => void sair()}>
              <LogOut /> Sair
            </Button>
          </div>
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navegação rápida"
      >
        {itens.slice(0, 5).map((item) => (
          <Link
            key={item.label}
            to={item.to}
            search={item.search}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
              item.ativo(location.pathname, search) && "font-semibold text-primary",
            )}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
