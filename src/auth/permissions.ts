// Adaptado do Neuro Hub Pro (src/auth/permissions.ts): uma única tabela de
// rotas por perfil, consultada tanto pela navegação quanto pelo guard de rota.
// A regra definitiva é a RLS do banco; isto apenas evita mostrar o que o
// perfil não pode usar.
export type Papel = "admin" | "financeiro" | "consulta";

type Permissao = { primeiraRota: string; prefixos: readonly string[] | null };

const ROTAS: Record<Papel, Permissao> = {
  admin: { primeiraRota: "/", prefixos: null },
  financeiro: {
    primeiraRota: "/",
    prefixos: ["/", "/pessoas", "/lancamentos", "/relatorios", "/nfse"],
  },
  consulta: { primeiraRota: "/", prefixos: ["/", "/lancamentos", "/relatorios"] },
};

export function podeAcessar(papel: Papel, pathname: string): boolean {
  const prefixos = ROTAS[papel].prefixos;
  if (prefixos === null) return true;
  return prefixos.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function primeiraRota(papel: Papel): string {
  return ROTAS[papel].primeiraRota;
}

export function podeEditarFinanceiro(papel: Papel): boolean {
  return papel === "admin" || papel === "financeiro";
}

export function podeAdministrar(papel: Papel): boolean {
  return papel === "admin";
}
