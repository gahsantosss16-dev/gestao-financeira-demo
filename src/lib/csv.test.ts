import { describe, expect, it } from "vitest";
import { celulaCsv, gerarCsv } from "./csv";

describe("csv", () => {
  it("escapa separador e aspas", () => {
    expect(celulaCsv('a;b "c"')).toBe('"a;b ""c"""');
  });
  it("neutraliza fórmulas", () => {
    expect(celulaCsv("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celulaCsv("-10,00")).toBe("'-10,00");
  });
  it("gera linhas com CRLF", () => {
    expect(gerarCsv(["A", "B"], [["1", "2"]])).toBe("A;B\r\n1;2");
  });
});
