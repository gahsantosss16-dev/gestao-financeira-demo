import { describe, expect, it } from "vitest";
import { derivarUuid, montarParcelas, saldoCentavos, situacao } from "./lancamentos";

const base = {
  tipo: "receber" as const,
  descricao: " Mensalidade ",
  pessoa_id: null,
  categoria_id: null,
  competencia: "",
  primeiroVencimento: "2026-01-31",
  valorTotalCentavos: 10000,
  parcelas: 3,
  documento_ref: null,
  observacoes: null,
};
const chave = "123e4567-e89b-42d3-a456-426614174000";

describe("lançamentos", () => {
  it("vencido é derivado da data, não gravado", () => {
    expect(situacao({ status: "aberto", vencimento: "2026-10-01" }, "2026-10-24")).toBe("vencido");
    expect(situacao({ status: "parcial", vencimento: "2026-10-24" }, "2026-10-24")).toBe("parcial");
    expect(situacao({ status: "pago", vencimento: "2026-01-01" }, "2026-10-24")).toBe("pago");
  });

  it("saldo de cancelado é zero", () => {
    expect(saldoCentavos({ status: "cancelado", valor_centavos: 100, valor_pago_centavos: 0 })).toBe(0);
    expect(saldoCentavos({ status: "parcial", valor_centavos: 100, valor_pago_centavos: 40 })).toBe(60);
  });

  it("parcelamento soma o total, avança meses e tem chaves estáveis", () => {
    const linhas = montarParcelas(base, chave);
    expect(linhas.map((l) => l.valor_centavos)).toEqual([3334, 3333, 3333]);
    expect(linhas.map((l) => l.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(linhas[1].descricao).toBe("Mensalidade (2/3)");
    expect(new Set(linhas.map((l) => l.chave_idempotencia)).size).toBe(3);
    expect(montarParcelas(base, chave).map((l) => l.chave_idempotencia)).toEqual(linhas.map((l) => l.chave_idempotencia));
  });

  it("deriva UUIDs válidos", () => {
    expect(derivarUuid(chave, 1)).toMatch(/^[0-9a-f-]{36}$/);
    expect(derivarUuid("123e4567-e89b-42d3-a456-ffffffffffff", 1)).toBe("123e4567-e89b-42d3-a456-000000000000");
  });

  it("recusa descrição vazia", () => {
    expect(() => montarParcelas({ ...base, descricao: "  " }, chave)).toThrow(/descrição/);
  });
});
