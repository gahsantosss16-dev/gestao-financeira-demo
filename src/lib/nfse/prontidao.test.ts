import { describe, expect, it } from "vitest";
import { ambienteFiscalPermitido, pendenciasEmissao, type ConfiguracaoNfse } from "./prontidao";

const completa: ConfiguracaoNfse = {
  ambiente: "homologacao",
  cnpj_prestador: "11222333000181",
  inscricao_municipal: "123",
  codigo_municipio_ibge: "5002704",
  regime_tributario: "informado-pela-contabilidade",
  codigo_tributacao_nacional: "informado-pela-contabilidade",
  serie_dps: "1",
  url_api: "https://homologacao.exemplo.invalid",
  validada: true,
  producao_habilitada: false,
};
const tomador = { nome: "Associado sintético", documento: "52998224725", codigo_municipio_ibge: "5002704" };

describe("prontidão da NFS-e", () => {
  it("configuração completa e validada em homologação não tem pendências", () => {
    expect(pendenciasEmissao(completa, tomador, "development")).toEqual([]);
  });

  it("campo fiscal vazio é pendência, nunca valor presumido", () => {
    const pend = pendenciasEmissao({ ...completa, codigo_tributacao_nacional: " " }, tomador, "development");
    expect(pend).toContain("Código de tributação nacional não informado.");
  });

  it("produção exige autorização e o sistema de produção", () => {
    const prod = { ...completa, ambiente: "producao" as const };
    expect(pendenciasEmissao(prod, tomador, "production")).toContain("Emissão em produção não autorizada.");
    expect(pendenciasEmissao({ ...prod, producao_habilitada: true }, tomador, "qa")).toContain(
      "Produção fiscal só pode ser usada pelo sistema de produção.",
    );
    expect(pendenciasEmissao({ ...prod, producao_habilitada: true }, tomador, "production")).toEqual([]);
  });

  it("QA e desenvolvimento só enxergam homologação", () => {
    expect(ambienteFiscalPermitido("qa")).toEqual(["homologacao"]);
    expect(ambienteFiscalPermitido("development")).toEqual(["homologacao"]);
  });

  it("exige tomador identificado", () => {
    expect(pendenciasEmissao(completa, { ...tomador, documento: null }, "development")).toContain("Tomador sem CPF/CNPJ.");
    expect(pendenciasEmissao(null, tomador, "development")).toEqual(["Configuração fiscal não cadastrada."]);
  });
});
