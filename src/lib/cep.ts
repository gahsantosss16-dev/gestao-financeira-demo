// Reaproveitado do LSB (src/lib/cep.ts): ViaCEP com fallback BrasilAPI e
// código IBGE do município (necessário para a NFS-e do tomador).
// Consultas públicas e gratuitas, acionadas somente pelo usuário.
export type CepInfo = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
  codigoMunicipio: string;
};

type Json = Record<string, unknown>;

function texto(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizeViaCep(clean: string, data: Json): CepInfo | null {
  if (data.erro || !data.localidade || !data.uf) return null;
  return {
    cep: clean,
    rua: texto(data.logradouro),
    bairro: texto(data.bairro),
    cidade: texto(data.localidade),
    estado: texto(data.uf).toUpperCase(),
    codigoMunicipio: texto(data.ibge).replace(/\D/g, "").slice(0, 7),
  };
}

function normalizeBrasilApi(clean: string, data: Json): CepInfo | null {
  if (!data.city || !data.state) return null;
  return {
    cep: clean,
    rua: texto(data.street),
    bairro: texto(data.neighborhood),
    cidade: texto(data.city),
    estado: texto(data.state).toUpperCase(),
    codigoMunicipio: texto(data.city_ibge ?? data.codigo_municipio_ibge).replace(/\D/g, "").slice(0, 7),
  };
}

async function lookupMunicipioIbge(estado: string, cidade: string, fetcher: typeof fetch): Promise<string> {
  try {
    const res = await fetcher(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(estado)}/municipios`,
    );
    if (!res.ok) return "";
    const municipios = (await res.json()) as Json[];
    const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const found = Array.isArray(municipios)
      ? municipios.find((item) => normalize(texto(item?.nome)) === normalize(cidade))
      : null;
    return texto(found?.id).replace(/\D/g, "").slice(0, 7);
  } catch {
    return "";
  }
}

export async function lookupCep(cep: string, fetcher: typeof fetch = fetch): Promise<CepInfo | null> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;

  let info: CepInfo | null = null;
  try {
    const res = await fetcher(`https://viacep.com.br/ws/${clean}/json/`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) info = normalizeViaCep(clean, (await res.json()) as Json);
  } catch {
    // tenta a base alternativa
  }

  if (!info) {
    try {
      const res = await fetcher(`https://brasilapi.com.br/api/cep/v2/${clean}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) info = normalizeBrasilApi(clean, (await res.json()) as Json);
    } catch {
      // consulta opcional: o usuário pode preencher manualmente
    }
  }

  if (!info) return null;
  if (!info.codigoMunicipio) {
    info.codigoMunicipio = await lookupMunicipioIbge(info.estado, info.cidade, fetcher);
  }
  return info;
}
