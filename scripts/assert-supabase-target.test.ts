import { describe, expect, it } from "vitest";
import { checkSupabaseTarget, findDuplicatedRefs, isSecretSupabaseKey } from "./assert-supabase-target.mjs";

const DEV = "aaaaaaaaaaaaaaaaaaaa";
const QA = "bbbbbbbbbbbbbbbbbbbb";
const PROD = "cccccccccccccccccccc";
const targets = { development: [DEV], qa: [QA], production: [PROD] };
const url = (ref: string) => `https://${ref}.supabase.co`;
const fakeJwt = (role: string) =>
  ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "sig"].join(".");

describe("assert-supabase-target", () => {
  it("aceita cada ambiente apontando para o próprio Supabase", () => {
    expect(checkSupabaseTarget({ VITE_APP_ENV: "development", VITE_SUPABASE_URL: url(DEV) }, targets)).toEqual([]);
    expect(checkSupabaseTarget({ VITE_APP_ENV: "qa", VITE_SUPABASE_URL: url(QA), VITE_PUBLIC_APP_URL: "https://qa.financeiro.associapec.com.br" }, targets)).toEqual([]);
    expect(checkSupabaseTarget({ VITE_APP_ENV: "production", VITE_SUPABASE_URL: url(PROD), VITE_PUBLIC_APP_URL: "https://financeiro.associapec.com.br" }, targets)).toEqual([]);
  });

  it("bloqueia desenvolvimento ou QA apontando para produção", () => {
    expect(checkSupabaseTarget({ VITE_APP_ENV: "development", VITE_SUPABASE_URL: url(PROD) }, targets)).toHaveLength(1);
    expect(checkSupabaseTarget({ VITE_APP_ENV: "qa", VITE_SUPABASE_URL: url(PROD) }, targets)).toHaveLength(1);
  });

  it("bloqueia produção sem Supabase cadastrado ou usando o de QA", () => {
    expect(checkSupabaseTarget({ VITE_APP_ENV: "production", VITE_SUPABASE_URL: url(QA) }, targets)).toHaveLength(1);
    expect(checkSupabaseTarget({ VITE_APP_ENV: "production", VITE_SUPABASE_URL: url(PROD) }, { development: [], qa: [], production: [] })).toHaveLength(1);
  });

  it("bloqueia chave service_role em variável VITE_", () => {
    expect(isSecretSupabaseKey(fakeJwt("service_role"))).toBe(true);
    expect(isSecretSupabaseKey("sb_secret_abc")).toBe(true);
    expect(isSecretSupabaseKey(fakeJwt("anon"))).toBe(false);
    const errors = checkSupabaseTarget(
      { VITE_APP_ENV: "development", VITE_SUPABASE_URL: url(DEV), VITE_SUPABASE_ANON_KEY: fakeJwt("service_role") },
      targets,
    );
    expect(errors.join(" ")).toMatch(/service_role/);
  });

  it("detecta o mesmo ref cadastrado em dois ambientes", () => {
    expect(findDuplicatedRefs({ development: [DEV], qa: [DEV], production: [] })).toHaveLength(1);
  });
});
