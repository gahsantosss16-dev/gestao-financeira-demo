import { describe, expect, it } from "vitest";
import { mensagemDeErro } from "./erros";

describe("mensagemDeErro", () => {
  it("traduz duplicidade de documento", () => {
    expect(mensagemDeErro({ code: "23505", message: 'duplicate key value violates unique constraint "pessoas_documento_unico"' })).toMatch(/CPF\/CNPJ/);
  });
  it("preserva a mensagem de negócio do banco", () => {
    expect(mensagemDeErro({ code: "22023", message: "Valor maior que o saldo em aberto do lançamento." })).toMatch(/saldo/);
    expect(mensagemDeErro({ code: "42501", message: "Estorne as baixas antes de cancelar o lançamento." })).toMatch(/Estorne/);
  });
  it("não vaza mensagem técnica desconhecida", () => {
    expect(mensagemDeErro({ code: "XX000", message: "internal stack trace" })).toBe("Não foi possível concluir a operação.");
    expect(mensagemDeErro({ code: "42501", message: "permission denied for table lancamentos" })).toMatch(/permissão/);
  });
});
