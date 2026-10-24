import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { podeAcessar, primeiraRota } from "@/auth/permissions";
import { useSessionTimeout } from "@/auth/useSessionTimeout";
import { AppLayout } from "@/components/layout/AppLayout";
import { LancamentosPage } from "@/routes/lancamentos";
import { LoginPage } from "@/routes/login";
import { NfsePage } from "@/routes/nfse";
import { PainelPage } from "@/routes/painel";
import { PessoasPage } from "@/routes/pessoas";
import { RelatoriosPage } from "@/routes/relatorios";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: function Login() {
    const { redirect } = loginRoute.useSearch();
    return <LoginPage redirect={redirect} />;
  },
});

/** Área autenticada: exige sessão + perfil ativo e respeita o perfil na rota. */
function AreaAutenticada() {
  const { status, perfil, sair } = useAuth();
  const location = useRouterState({ select: (s) => s.location });
  const expirar = useCallback(() => void sair(), [sair]);
  useSessionTimeout(status === "autenticado" ? perfil?.id : undefined, expirar);

  if (status === "carregando") {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (status !== "autenticado" || !perfil) {
    return <Navigate to="/login" search={{ redirect: location.href }} replace />;
  }
  if (!podeAcessar(perfil.papel, location.pathname)) {
    return <Navigate to={primeiraRota(perfil.papel)} replace />;
  }
  return <AppLayout />;
}

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AreaAutenticada });

const painelRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: PainelPage });
const pessoasRoute = createRoute({ getParentRoute: () => appRoute, path: "/pessoas", component: PessoasPage });
const lancamentosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/lancamentos",
  validateSearch: z.object({ tipo: z.enum(["pagar", "receber"]).catch("receber") }),
  component: function Lancamentos() {
    const { tipo } = lancamentosRoute.useSearch();
    return <LancamentosPage key={tipo} tipo={tipo} />;
  },
});
const relatoriosRoute = createRoute({ getParentRoute: () => appRoute, path: "/relatorios", component: RelatoriosPage });
const nfseRoute = createRoute({ getParentRoute: () => appRoute, path: "/nfse", component: NfsePage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([painelRoute, pessoasRoute, lancamentosRoute, relatoriosRoute, nfseRoute]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultNotFoundComponent: () => <Navigate to="/" replace />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
