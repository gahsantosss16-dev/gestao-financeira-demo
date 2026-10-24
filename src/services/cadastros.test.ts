import { describe, expect, it } from "vitest";
import { termoDeBusca } from "./cadastros";

describe("termoDeBusca", () => {
  it("remove caracteres que quebrariam o filtro do PostgREST", () => {
    expect(termoDeBusca("Silva,nome.eq.x)")).toBe("Silva nome.eq.x");
    expect(termoDeBusca("  João  ")).toBe("João");
  });
});
