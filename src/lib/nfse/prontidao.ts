// Arquitetura da NFS-e (Campo Grande/MS) — Etapa 1: somente as regras de
// prontidão, sem nenhuma comunicação com a prefeitura. A montagem do XML da
// DPS, a validação contra os XSD oficiais e a assinatura digital serão feitas
// em função de servidor (o certificado nunca chega ao navegador), em etapa
// própria e somente em homologação até autorização expressa.

export type AmbienteNfse = "homologacao" | "producao";

export type ConfiguracaoNfse = {
  ambiente: AmbienteNfse;
  cnpj_prestador: string | null;
  inscricao_municipal: string | null;
  codigo_municipio_ibge: string | null;
  regime_tributario: string | null;
  codigo_tributacao_nacional: string | null;
  serie_dps: string | null;
  url_api: string | null;
  validada: boolean;
  producao_habilitada: boolean;
};

export type TomadorNfse = {
  nome: string;
  documento: string | null;
  codigo_municipio_ibge: string | null;
};

const CAMPOS_OBRIGATORIOS: Array<[keyof ConfiguracaoNfse, string]> = [
  ["cnpj_prestador", "CNPJ do prestador"],
  ["inscricao_municipal", "Inscrição municipal"],
  ["codigo_municipio_ibge", "Código IBGE do município"],
  ["regime_tributario", "Regime tributário"],
  ["codigo_tributacao_nacional", "Código de tributação nacional"],
  ["serie_dps", "Série da DPS"],
  ["url_api", "Endereço da API da prefeitura"],
];

/**
 * Lista o que impede uma emissão. Lista vazia = pode seguir para a função de
 * servidor (que repete todas as verificações). Nada é preenchido por
 * suposição: campo fiscal vazio é pendência, nunca um valor padrão.
 */
export function pendenciasEmissao(
  config: ConfiguracaoNfse | null,
  tomador: TomadorNfse | null,
  ambienteDoSistema: string,
): string[] {
  if (!config) return ["Configuração fiscal não cadastrada."];
  const pendencias: string[] = [];
  for (const [campo, rotulo] of CAMPOS_OBRIGATORIOS) {
    const valor = config[campo];
    if (typeof valor !== "string" || !valor.trim()) pendencias.push(`${rotulo} não informado.`);
  }
  if (!config.validada) pendencias.push("Configuração fiscal ainda não validada pela contabilidade.");
  if (config.ambiente === "producao") {
    if (!config.producao_habilitada) pendencias.push("Emissão em produção não autorizada.");
    if (ambienteDoSistema !== "production") pendencias.push("Produção fiscal só pode ser usada pelo sistema de produção.");
  }
  if (!tomador) pendencias.push("Lançamento sem tomador vinculado.");
  else {
    if (!tomador.documento) pendencias.push("Tomador sem CPF/CNPJ.");
    if (!tomador.codigo_municipio_ibge) pendencias.push("Tomador sem código IBGE do município.");
  }
  return pendencias;
}

/** Ambiente fiscal que o sistema pode usar: fora de produção, sempre homologação. */
export function ambienteFiscalPermitido(ambienteDoSistema: string): AmbienteNfse[] {
  return ambienteDoSistema === "production" ? ["homologacao", "producao"] : ["homologacao"];
}
