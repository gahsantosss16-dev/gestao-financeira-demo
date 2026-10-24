// Configuração da API municipal de NFS-e — Campo Grande/MS.
// Módulo puro (sem APIs de Deno/navegador): usado pela Edge Function `nfse`
// e importado pelo frontend apenas para exibição. Não contém segredos.

export type FiscalEnv = 'homologacao' | 'producao';

export const NFSE_BASE_URL: Record<FiscalEnv, string> = {
  homologacao: 'https://nfse2-cgr.dsfweb.com.br',
  producao: 'https://nfseapi.campogrande.ms.gov.br',
};

export type NfseOperation = 'emitir' | 'evento' | 'consultar_nfse' | 'consultar_dps';

export interface NfseRequestSpec {
  operation: NfseOperation;
  method: 'GET' | 'POST';
  url: string;
}

// chave de acesso e id da DPS só podem conter caracteres seguros para a URL
const SAFE_ID = /^[A-Za-z0-9]{1,80}$/;
function safeId(label: string, value: string | undefined): string {
  if (!value || !SAFE_ID.test(value)) throw new Error(`${label} inválido`);
  return value;
}

/** Monta método e URL de cada endpoint documentado. */
export function buildNfseRequest(
  env: FiscalEnv,
  operation: NfseOperation,
  params: { chaveAcesso?: string; dpsId?: string } = {},
): NfseRequestSpec {
  const base = `${NFSE_BASE_URL[env]}/notafiscal-ws/nfse`;
  switch (operation) {
    case 'emitir':
      return { operation, method: 'POST', url: base };
    case 'evento':
      return { operation, method: 'POST', url: `${base}/${safeId('Chave de acesso', params.chaveAcesso)}/eventos` };
    case 'consultar_nfse':
      return { operation, method: 'GET', url: `${base}/${safeId('Chave de acesso', params.chaveAcesso)}` };
    case 'consultar_dps':
      return { operation, method: 'GET', url: `${base}/dps/${safeId('Id da DPS', params.dpsId)}` };
  }
}

/**
 * Segregação de ambientes: produção só é aceita quando explicitamente liberada
 * no backend (secret NFSE_PRODUCTION_ENABLED=true). Na Etapa 1 permanece bloqueada.
 */
export function resolveEnvironment(requested: unknown, productionEnabled: boolean): FiscalEnv {
  if (requested === undefined || requested === null || requested === 'homologacao') return 'homologacao';
  if (requested === 'producao') {
    if (!productionEnabled) throw new Error('Ambiente de produção não liberado');
    return 'producao';
  }
  throw new Error('Ambiente fiscal inválido');
}
