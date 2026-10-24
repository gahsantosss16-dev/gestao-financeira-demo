// Retorno dos links de e-mail do Supabase Auth (convite, recuperação de senha).
//
// O Supabase redireciona para a Site URL / redirect_to com os dados no fragmento:
//   sucesso: #access_token=...&refresh_token=...&type=invite|recovery|signup|magiclink
//   erro:    #error=access_denied&error_code=otp_expired&error_description=...
// O app usa rotas por hash (#/receber), então o fragmento é lido e REMOVIDO da
// barra de endereço antes do roteador montar — os tokens não ficam no histórico.

export type AuthLinkType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email_change' | string;

export type AuthRedirect =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: AuthLinkType }
  | { kind: 'error'; error: string; code: string | null; description: string | null };

/** Interpreta o fragmento da URL. Rotas do app (#/...) e fragmentos vazios retornam null. */
export function parseAuthHash(hash: string): AuthRedirect | null {
  const raw = hash.replace(/^#/, '');
  if (!raw || raw.startsWith('/')) return null;
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken, type: params.get('type') ?? '' };
  }
  const error = params.get('error') ?? params.get('error_code');
  if (error) {
    return { kind: 'error', error, code: params.get('error_code'), description: params.get('error_description') };
  }
  return null;
}

/** Tipos de link que exigem que o usuário defina uma senha antes de usar o sistema. */
export const requiresPasswordSetup = (r: AuthRedirect | null) =>
  r?.kind === 'session' && (r.type === 'invite' || r.type === 'recovery');

export const PASSWORD_ROUTE = '/definir-senha';

/** Lê e limpa o fragmento de autenticação da URL atual (uma vez, no carregamento). */
export function captureAuthRedirect(loc: Location = window.location, history: History = window.history): AuthRedirect | null {
  const result = parseAuthHash(loc.hash);
  if (result) {
    const target = requiresPasswordSetup(result) ? `#${PASSWORD_ROUTE}` : '#/';
    history.replaceState(history.state, '', `${loc.pathname}${loc.search}${target}`);
  }
  return result;
}

/** Endereço base do app (funciona em localhost, subpasta ou domínio próprio). */
export const appBaseUrl = (loc: Location = window.location) => `${loc.origin}${loc.pathname}`;

export function describeAuthError(r: Extract<AuthRedirect, { kind: 'error' }>): string {
  if (r.code === 'otp_expired') {
    return 'Este link já foi utilizado ou expirou. Clique em “Esqueci minha senha” para receber um novo link, ou peça ao administrador um novo envio.';
  }
  if (r.error === 'access_denied') return 'Acesso negado pelo link recebido. Solicite um novo envio ao administrador.';
  return `Não foi possível validar o link recebido (${r.code ?? r.error}).`;
}

// Capturado na carga do módulo — main.tsx importa este arquivo antes de qualquer outro.
let pending: AuthRedirect | null = typeof window !== 'undefined' ? captureAuthRedirect() : null;

/** Entrega o retorno capturado uma única vez. */
export function takePendingAuthRedirect(): AuthRedirect | null {
  const r = pending;
  pending = null;
  return r;
}

export const PASSWORD_MIN_LENGTH = 8;
export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Use letras e números na senha.';
  if (password !== confirm) return 'As senhas não conferem.';
  return null;
}
