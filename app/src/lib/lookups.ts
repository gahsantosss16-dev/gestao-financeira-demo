// Consultas públicas e gratuitas, sob demanda (botão), portadas do LSB
// (src/lib/consulta-cnpj.ts e src/lib/cep.ts). Nada é gravado sem "Salvar".
// CPF nunca é enviado a serviços externos.
import { onlyDigits } from './documents';

export interface CnpjData {
  legalName: string;
  tradeName: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  phone: string;
  email: string;
  cityIbgeCode: string;
  situation: string;
  /** IEs vinculadas ao CNPJ, quando a base pública informa */
  stateRegistrations: { uf: string; ie: string; active: boolean }[];
}

type Fetch = typeof fetch;
const withTimeout = (ms: number) => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined);

export async function lookupCnpj(document: string, fetcher: Fetch = fetch): Promise<CnpjData> {
  const cnpj = onlyDigits(document);
  if (cnpj.length !== 14) throw new Error('Informe um CNPJ com 14 números.');
  let response: Response;
  try {
    response = await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: withTimeout(12000) });
  } catch {
    throw new Error('Consulta indisponível no momento. Você pode preencher manualmente.');
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error('CNPJ não encontrado na base pública.');
    if (response.status === 429) throw new Error('Limite de consultas atingido. Tente novamente mais tarde.');
    throw new Error('Consulta indisponível no momento. Você pode preencher manualmente.');
  }
  const data = await response.json();
  let email = String(data.email ?? '').trim();
  let stateRegistrations: CnpjData['stateRegistrations'] = [];
  // Base complementar (cnpj.ws pública): e-mail ausente e inscrições estaduais.
  // Opcional — falha ou limite não bloqueiam os demais dados.
  try {
    const alt = await fetcher(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: withTimeout(8000) });
    if (alt.ok) {
      const det = await alt.json();
      const est = det?.estabelecimento;
      if (onlyDigits(String(est?.cnpj ?? '')) === cnpj) {
        if (!email) email = String(est?.email ?? '').trim();
        stateRegistrations = (Array.isArray(est?.inscricoes_estaduais) ? est.inscricoes_estaduais : [])
          .map((i: { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }) => ({
            uf: String(i?.estado?.sigla ?? '').toUpperCase(),
            ie: onlyDigits(String(i?.inscricao_estadual ?? '')),
            active: i?.ativo !== false,
          }))
          .filter((i: { uf: string; ie: string }) => /^[A-Z]{2}$/.test(i.uf) && i.ie.length >= 2);
      }
    }
  } catch { /* consulta complementar é opcional */ }
  return {
    legalName: String(data.razao_social ?? ''),
    tradeName: String(data.nome_fantasia ?? ''),
    cep: onlyDigits(String(data.cep ?? '')),
    street: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' '),
    number: String(data.numero ?? ''),
    complement: String(data.complemento ?? ''),
    district: String(data.bairro ?? ''),
    city: String(data.municipio ?? ''),
    uf: String(data.uf ?? '').toUpperCase(),
    phone: onlyDigits(String(data.ddd_telefone_1 ?? '')),
    email,
    cityIbgeCode: onlyDigits(String(data.codigo_municipio_ibge ?? '')).slice(0, 7),
    situation: String(data.descricao_situacao_cadastral ?? ''),
    stateRegistrations,
  };
}

export interface CepData { cep: string; street: string; district: string; city: string; uf: string; cityIbgeCode: string }

export async function lookupCep(cep: string, fetcher: Fetch = fetch): Promise<CepData | null> {
  const clean = onlyDigits(cep);
  if (clean.length !== 8) return null;
  let info: CepData | null = null;
  try {
    const res = await fetcher(`https://viacep.com.br/ws/${clean}/json/`);
    if (res.ok) {
      const d = await res.json();
      if (!d?.erro && d?.localidade && d?.uf) {
        info = { cep: clean, street: d.logradouro ?? '', district: d.bairro ?? '', city: d.localidade, uf: String(d.uf).toUpperCase(), cityIbgeCode: onlyDigits(String(d.ibge ?? '')).slice(0, 7) };
      }
    }
  } catch { /* tenta a alternativa */ }
  if (!info) {
    try {
      const res = await fetcher(`https://brasilapi.com.br/api/cep/v2/${clean}`);
      if (res.ok) {
        const d = await res.json();
        if (d?.city && d?.state) {
          info = { cep: clean, street: d.street ?? '', district: d.neighborhood ?? '', city: d.city, uf: String(d.state).toUpperCase(), cityIbgeCode: onlyDigits(String(d.city_ibge ?? '')).slice(0, 7) };
        }
      }
    } catch { /* sem resultado */ }
  }
  return info;
}
