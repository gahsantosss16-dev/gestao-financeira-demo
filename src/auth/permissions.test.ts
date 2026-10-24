import { describe, expect, it } from "vitest";
import { podeAcessar, podeAdministrar, podeEditarFinanceiro } from "./permissions";

describe("permissões por perfil", () => {
  it("admin acessa tudo", () => {
    expect(podeAcessar("admin", "/usuarios")).toBe(true);
    expect(podeAdministrar("admin")).toBe(true);
  });

  it("financeiro edita, mas não administra usuários", () => {
    expect(podeAcessar("financeiro", "/lancamentos")).toBe(true);
    expect(podeAcessar("financeiro", "/usuarios")).toBe(false);
    expect(podeEditarFinanceiro("financeiro")).toBe(true);
  });

  it("consulta só lê e não vê cadastros", () => {
    expect(podeAcessar("consulta", "/relatorios")).toBe(true);
    expect(podeAcessar("consulta", "/pessoas")).toBe(false);
    expect(podeAcessar("consulta", "/lancamentosX")).toBe(false);
    expect(podeEditarFinanceiro("consulta")).toBe(false);
  });
});
