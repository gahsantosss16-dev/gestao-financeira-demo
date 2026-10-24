// Edge Function `nfse` — backend das operações fiscais (Supabase / Deno).
//
// Responsabilidades (o frontend NUNCA fala diretamente com a prefeitura):
//   1. autenticar o usuário (JWT do Supabase Auth) e exigir perfil admin/fiscal;
//   2. segregar homologação e produção (produção bloqueada por padrão);
//   3. montar a requisição para a API municipal de Campo Grande/MS;
//   4. registrar toda solicitação, resposta e erro em `nfse_requests`.
//
// ESTADO NA ETAPA 1:
//   - A integração está DESLIGADA (secret NFSE_INTEGRATION_ENABLED != "true").
//     Toda chamada é registrada e respondida com status "nao_habilitado".
//   - Geração do XML da DPS, validação XSD e assinatura digital são da Etapa 3
//     e respondem 501 — nada aqui simula uma emissão bem-sucedida.
//   - As consultas (GET) estão implementadas com certificado de cliente (mTLS),
//     mas NÃO foram testadas contra a prefeitura. O mecanismo de autenticação
//     exigido pela API deve ser confirmado na documentação técnica analisada.
//
// Secrets (definidos com `supabase secrets set`, nunca no frontend/repositório):
//   NFSE_INTEGRATION_ENABLED   "true" para habilitar chamadas externas
//   NFSE_PRODUCTION_ENABLED    "true" somente após liberação formal
//   NFSE_CLIENT_CERT_PEM       certificado (PEM) extraído do A1 da ASSOCIAPEC
//   NFSE_CLIENT_KEY_PEM        chave privada (PEM) correspondente
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (injetados pelo Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { buildNfseRequest, resolveEnvironment, type NfseOperation } from '../_shared/nfseEndpoints.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const OPERATIONS: NfseOperation[] = ['emitir', 'evento', 'consultar_nfse', 'consultar_dps'];

interface Body {
  action?: NfseOperation;
  environment?: string;
  documentId?: string;
  chaveAcesso?: string;
  dpsId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { status: 'erro', message: 'Método não permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. autenticação e autorização
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { status: 'erro', message: 'Sessão inválida' });
  // o perfil é lido com o token do próprio usuário (RLS: cada um vê o seu)
  const { data: profile } = await userClient.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
  if (!profile?.active || !['admin', 'fiscal'].includes(profile.role)) {
    return json(403, { status: 'erro', message: 'Perfil sem permissão para operações fiscais' });
  }

  // 2. validação da entrada
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { status: 'erro', message: 'JSON inválido' });
  }
  if (!body.action || !OPERATIONS.includes(body.action)) {
    return json(400, { status: 'erro', message: 'Operação inválida' });
  }

  let environment;
  let spec;
  try {
    environment = resolveEnvironment(body.environment, Deno.env.get('NFSE_PRODUCTION_ENABLED') === 'true');
    spec = buildNfseRequest(environment, body.action, body);
  } catch (e) {
    return json(400, { status: 'erro', message: (e as Error).message });
  }

  const log = async (entry: { http_status?: number | null; response_body?: string | null; error?: string | null; duration_ms?: number }) => {
    await admin.from('nfse_requests').insert({
      nfse_document_id: body.documentId ?? null,
      environment,
      operation: spec.operation,
      http_method: spec.method,
      url: spec.url,
      requested_by: userData.user.id,
      ...entry,
    });
  };

  // 3. integração desligada por padrão
  if (Deno.env.get('NFSE_INTEGRATION_ENABLED') !== 'true') {
    const message = 'Integração fiscal não habilitada: aguardando confirmação do certificado digital e liberação para homologação.';
    await log({ error: message });
    return json(503, { status: 'nao_habilitado', message, environment, request: spec });
  }

  // 4. emissão e eventos dependem de DPS assinada (Etapa 3)
  if (spec.operation === 'emitir' || spec.operation === 'evento') {
    const message = 'Geração do XML, validação XSD e assinatura digital da DPS serão implementadas na Etapa 3.';
    await log({ http_status: 501, error: message });
    return json(501, { status: 'nao_implementado', message, environment, request: spec });
  }

  // 5. consultas com certificado de cliente
  const cert = Deno.env.get('NFSE_CLIENT_CERT_PEM');
  const key = Deno.env.get('NFSE_CLIENT_KEY_PEM');
  if (!cert || !key) {
    const message = 'Certificado digital não configurado no backend.';
    await log({ error: message });
    return json(503, { status: 'nao_habilitado', message, environment, request: spec });
  }

  const started = Date.now();
  try {
    const client = Deno.createHttpClient({ cert, key });
    const res = await fetch(spec.url, { method: spec.method, client, headers: { Accept: 'application/json' } });
    const text = await res.text();
    await log({ http_status: res.status, response_body: text.slice(0, 20000), duration_ms: Date.now() - started });
    return json(res.ok ? 200 : 502, { status: res.ok ? 'ok' : 'erro_prefeitura', httpStatus: res.status, body: text, environment });
  } catch (e) {
    const message = `Falha de comunicação com a prefeitura: ${(e as Error).message}`;
    await log({ error: message, duration_ms: Date.now() - started });
    return json(502, { status: 'erro', message, environment });
  }
});
