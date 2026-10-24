import { describe, expect, it } from "vitest";
import { digitosParaCentavos, dividirEmParcelas, formatCentavos } from "./money";

describe("money", () => {
  it("formata centavos em reais", () => {
    expect(formatCentavos(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });

  it("interpreta a digitação por dígitos, sem parseFloat", () => {
    expect(digitosParaCentavos("R$ 2.000,00")).toBe(200000);
    expect(digitosParaCentavos("2.000")).toBe(2000);
    expect(digitosParaCentavos("")).toBe(0);
  });

  it("divide parcelas sem perder centavos", () => {
    const parcelas = dividirEmParcelas(10000, 3);
    expect(parcelas).toEqual([3334, 3333, 3333]);
    expect(parcelas.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(() => dividirEmParcelas(0, 2)).toThrow();
    expect(() => dividirEmParcelas(100, 0)).toThrow();
  });
});
