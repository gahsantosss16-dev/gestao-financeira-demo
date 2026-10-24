import { describe, expect, it } from "vitest";
import { posicaoAposDigitos } from "./caret";

describe("posicaoAposDigitos", () => {
  it("mantém o cursor depois do mesmo dígito após aplicar a máscara", () => {
    expect(posicaoAposDigitos("529.982.247-25", 3)).toBe(3);
    expect(posicaoAposDigitos("529.982.247-25", 4)).toBe(5);
    expect(posicaoAposDigitos("(67) 99999-8888", 2)).toBe(3);
    expect(posicaoAposDigitos("529.982", 0)).toBe(0);
    expect(posicaoAposDigitos("529", 9)).toBe(3);
  });
});
