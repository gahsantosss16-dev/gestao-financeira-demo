import { describe, expect, it } from "vitest";
import { isSafeInternalPath, loginDestination } from "./redirects";

describe("redirects", () => {
  it("aceita apenas caminhos internos", () => {
    expect(isSafeInternalPath("/lancamentos?tipo=pagar")).toBe(true);
    expect(isSafeInternalPath("//evil.example")).toBe(false);
    expect(isSafeInternalPath("/\\evil.example")).toBe(false);
    expect(isSafeInternalPath("https://evil.example")).toBe(false);
  });

  it("nunca volta para o próprio login", () => {
    expect(loginDestination("/login?redirect=/")).toBe("/");
    expect(loginDestination("/pessoas")).toBe("/pessoas");
    expect(loginDestination(undefined)).toBe("/");
  });
});
