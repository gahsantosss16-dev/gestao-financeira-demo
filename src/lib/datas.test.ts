import { describe, expect, it } from "vitest";
import { estaNoPeriodo, fimDoMes, formatDataBr, hojeIso, inicioDoMes, somarMeses } from "./datas";

describe("datas", () => {
  it("trabalha com dia civil", () => {
    expect(hojeIso(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(inicioDoMes("2026-10-24")).toBe("2026-10-01");
    expect(fimDoMes("2026-02-10")).toBe("2026-02-28");
    expect(formatDataBr("2026-10-24")).toBe("24/10/2026");
  });

  it("soma meses respeitando o fim do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("período inclui o mês inteiro, inclusive dias futuros", () => {
    expect(estaNoPeriodo("2026-10-31", inicioDoMes("2026-10-24"), fimDoMes("2026-10-24"))).toBe(true);
    expect(estaNoPeriodo("2026-11-01", inicioDoMes("2026-10-24"), fimDoMes("2026-10-24"))).toBe(false);
  });
});
