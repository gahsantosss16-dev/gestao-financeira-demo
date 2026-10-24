import { describe, expect, it } from "vitest";
import { lookupCep } from "./cep";
import { consultarCnpj } from "./consulta-cnpj";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("consultas públicas (sem rede: fetch simulado)", () => {
  it("CEP usa ViaCEP e devolve o código IBGE", async () => {
    const fetcher = (() =>
      json({ logradouro: "Rua Sintética", bairro: "Centro", localidade: "Campo Grande", uf: "ms", ibge: "5002704" })) as typeof fetch;
    expect(await lookupCep("79000-000", fetcher)).toMatchObject({ cidade: "Campo Grande", estado: "MS", codigoMunicipio: "5002704" });
  });

  it("CEP cai para a BrasilAPI quando o ViaCEP não encontra", async () => {
    const urls: string[] = [];
    const fetcher = ((url: string) => {
      urls.push(url);
      return url.includes("viacep") ? json({ erro: true }) : json({ city: "Campo Grande", state: "MS", city_ibge: "5002704" });
    }) as unknown as typeof fetch;
    expect((await lookupCep("79000000", fetcher))?.codigoMunicipio).toBe("5002704");
    expect(urls).toHaveLength(2);
  });

  it("CEP incompleto não consulta", async () => {
    expect(await lookupCep("7900")).toBeNull();
  });

  it("CNPJ: mensagens claras e nenhum envio de CPF", async () => {
    await expect(consultarCnpj("529.982.247-25")).rejects.toThrow(/14 números/);
    const notFound = (() => json({}, 404)) as typeof fetch;
    await expect(consultarCnpj("11222333000181", notFound)).rejects.toThrow(/não encontrado/);
  });
});
