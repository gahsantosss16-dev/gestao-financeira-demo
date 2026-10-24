// Reaproveitado do LSB (src/lib/consulta-cnpj.ts). Consulta pública sob
// demanda: nunca envia CPF e não grava nada sem o usuário salvar.
export type DadosCnpj = {
  razaoSocial: string;
  fantasia: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  telefone: string;
  email: string;
  codigoMunicipio: string;
};

type Json = Record<string, unknown>;
const texto = (value: unknown) => (value == null ? "" : String(value));

export async function consultarCnpj(documento: string, fetcher: typeof fetch = fetch): Promise<DadosCnpj> {
  const cnpj = documento.replace(/\D/g, "");
  if (cnpj.length !== 14) throw new Error("Informe um CNPJ com 14 números.");
  const response = await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if (response.status === 404) throw new Error("CNPJ não encontrado na base pública.");
    if (response.status === 429) throw new Error("Limite de consultas atingido. Tente novamente mais tarde.");
    throw new Error("Consulta indisponível no momento. Você pode preencher manualmente.");
  }
  const data = (await response.json()) as Json;
  return {
    razaoSocial: texto(data.razao_social),
    fantasia: texto(data.nome_fantasia),
    cep: texto(data.cep).replace(/\D/g, ""),
    rua: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(" "),
    numero: texto(data.numero),
    complemento: texto(data.complemento),
    bairro: texto(data.bairro),
    cidade: texto(data.municipio),
    estado: texto(data.uf),
    telefone: texto(data.ddd_telefone_1).replace(/\D/g, ""),
    email: texto(data.email).trim(),
    codigoMunicipio: texto(data.codigo_municipio_ibge),
  };
}
