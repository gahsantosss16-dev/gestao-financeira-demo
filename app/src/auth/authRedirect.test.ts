import { describe, expect, it } from 'vitest';
import { appBaseUrl, captureAuthRedirect, describeAuthError, parseAuthHash, requiresPasswordSetup, validatePassword } from './authRedirect';

describe('retorno dos links de e-mail do Supabase', () => {
  it('reconhece tokens de convite e de recuperação', () => {
    expect(parseAuthHash('#access_token=AAA&expires_in=3600&refresh_token=RRR&token_type=bearer&type=invite')).toEqual({ kind: 'session', accessToken: 'AAA', refreshToken: 'RRR', type: 'invite' });
    const rec = parseAuthHash('#access_token=A&refresh_token=R&type=recovery');
    expect(requiresPasswordSetup(rec)).toBe(true);
    expect(requiresPasswordSetup(parseAuthHash('#access_token=A&refresh_token=R&type=magiclink'))).toBe(false);
  });
  it('reconhece o erro de link expirado/usado', () => {
    const r = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(r).toEqual({ kind: 'error', error: 'access_denied', code: 'otp_expired', description: 'Email link is invalid or has expired' });
    expect(describeAuthError(r as Extract<typeof r, { kind: 'error' }>)).toMatch(/Esqueci minha senha/);
  });
  it('ignora rotas do app e fragmentos vazios', () => {
    expect(parseAuthHash('#/receber?status=vencido')).toBeNull();
    expect(parseAuthHash('')).toBeNull();
    expect(parseAuthHash('#')).toBeNull();
    expect(parseAuthHash('#access_token=sem_refresh')).toBeNull();
  });
  it('remove os tokens da barra de endereço e direciona para a definição de senha', () => {
    const calls: string[] = [];
    const loc = { hash: '#access_token=A&refresh_token=R&type=invite', pathname: '/', search: '' } as Location;
    const history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => calls.push(url) } as unknown as History;
    expect(captureAuthRedirect(loc, history)?.kind).toBe('session');
    expect(calls).toEqual(['/#/definir-senha']);
    const errLoc = { hash: '#error=access_denied&error_code=otp_expired', pathname: '/financeiro/', search: '' } as Location;
    captureAuthRedirect(errLoc, history);
    expect(calls[1]).toBe('/financeiro/#/');
    expect(calls.join()).not.toMatch(/access_token|refresh_token/);
  });
  it('não altera a URL em navegação normal', () => {
    let called = false;
    const history = { state: null, replaceState: () => { called = true; } } as unknown as History;
    captureAuthRedirect({ hash: '#/pagar', pathname: '/', search: '' } as Location, history);
    expect(called).toBe(false);
  });
  it('calcula o endereço base para localhost, subpasta e domínio próprio', () => {
    expect(appBaseUrl({ origin: 'http://localhost:5173', pathname: '/' } as Location)).toBe('http://localhost:5173/');
    expect(appBaseUrl({ origin: 'https://financeiro.associapec.com.br', pathname: '/' } as Location)).toBe('https://financeiro.associapec.com.br/');
    expect(appBaseUrl({ origin: 'https://exemplo.org', pathname: '/app/index.html' } as Location)).toBe('https://exemplo.org/app/index.html');
  });
  it('valida a nova senha', () => {
    expect(validatePassword('abc1', 'abc1')).toMatch(/8 caracteres/);
    expect(validatePassword('somenteletras', 'somenteletras')).toMatch(/letras e números/);
    expect(validatePassword('senha1234', 'senha12345')).toMatch(/não conferem/);
    expect(validatePassword('senha1234', 'senha1234')).toBeNull();
  });
});
