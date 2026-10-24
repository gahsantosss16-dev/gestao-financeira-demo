// Fluxo completo de convite com o cliente Supabase simulado (nenhuma chamada de rede).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Fake {
  session: { user: { id: string; email: string } } | null;
  profile: Record<string, unknown>;
  setSession: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  signIn: ReturnType<typeof vi.fn>;
  profileUpdates: unknown[];
}
const fake = vi.hoisted(() => ({}) as Fake);

vi.mock('./data/supabaseSource', async () => {
  const actual = await vi.importActual<typeof import('./data/supabaseSource')>('./data/supabaseSource');
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    Object.assign(q, {
      select: self, order: self, limit: self, eq: self,
      update: (patch: unknown) => { if (table === 'profiles') fake.profileUpdates.push(patch); return q; },
      maybeSingle: async () => ({ data: table === 'profiles' && fake.session ? fake.profile : null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });
    return q;
  };
  const client = {
    auth: {
      setSession: (...a: unknown[]) => fake.setSession(...a),
      getSession: async () => ({ data: { session: fake.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      updateUser: (...a: unknown[]) => fake.updateUser(...a),
      signOut: async () => { fake.session = null; return { error: null }; },
      signInWithPassword: (...a: unknown[]) => fake.signIn(...a),
      resetPasswordForEmail: async () => ({ error: null }),
    },
    from: builder,
    storage: { from: () => ({}) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  return { ...actual, supabaseConfigured: true, supabase: client };
});

async function renderAppWithHash(hash: string) {
  window.history.replaceState(null, '', '/' + hash);
  vi.resetModules();
  const { App } = await import('./App');
  return render(<App />);
}

beforeEach(() => {
  Object.assign(fake, {
    session: null,
    profile: { id: 'u1', email: 'convidado@exemplo.org', full_name: '', role: 'consulta', active: true },
    profileUpdates: [],
    setSession: vi.fn(async () => { fake.session = { user: { id: 'u1', email: 'convidado@exemplo.org' } }; return { data: {}, error: null }; }),
    updateUser: vi.fn(async () => ({ data: {}, error: null })),
    signIn: vi.fn(async ({ password }: { password: string }) => (password === 'SenhaAtual2026' ? { error: null } : { error: { message: 'Invalid login credentials' } })),
  });
  sessionStorage.clear();
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('aceite de convite (Supabase)', () => {
  it('cria a sessão, exige a definição de senha e libera o sistema', async () => {
    await renderAppWithHash('#access_token=TOKEN_A&refresh_token=TOKEN_R&expires_in=3600&token_type=bearer&type=invite');
    expect(await screen.findByRole('heading', { name: 'Defina sua senha' })).toBeTruthy();
    expect(fake.setSession).toHaveBeenCalledWith({ access_token: 'TOKEN_A', refresh_token: 'TOKEN_R' });
    // os tokens não ficam na barra de endereço
    expect(window.location.href).not.toMatch(/TOKEN_/);
    expect(window.location.hash).toBe('#/definir-senha');

    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Pessoa Convidada' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'curta' } });
    fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));
    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeTruthy();
    expect(fake.updateUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'Associapec2026' } });
    fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'Associapec2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha e entrar' }));
    expect(await screen.findByRole('heading', { name: 'Painel financeiro' })).toBeTruthy();
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'Associapec2026', data: { full_name: 'Pessoa Convidada' } });
    expect(fake.profileUpdates).toEqual([{ full_name: 'Pessoa Convidada' }]);
    expect(window.location.hash).toBe('#/');
  });

  it('mantém a exigência de senha após recarregar a página no meio do fluxo', async () => {
    await renderAppWithHash('#access_token=A&refresh_token=R&type=recovery');
    expect(await screen.findByRole('heading', { name: 'Defina sua senha' })).toBeTruthy();
    cleanup();
    await renderAppWithHash('#/definir-senha');
    expect(await screen.findByRole('heading', { name: 'Defina sua senha' })).toBeTruthy();
  });

  it('mostra mensagem clara quando o link já foi usado ou expirou', async () => {
    await renderAppWithHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(await screen.findByText(/já foi utilizado ou expirou/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeTruthy();
    expect(fake.setSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
  });

  it('link adulterado (token malformado) mostra erro em vez de travar', async () => {
    fake.setSession = vi.fn(async () => { throw new SyntaxError('Unexpected token in JSON'); });
    await renderAppWithHash('#access_token=token.invalido&refresh_token=x&type=invite');
    expect(await screen.findByText(/não é mais válido/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Defina sua senha' })).toBeNull();
    expect(window.location.hash).toBe('#/');
  });

  it('login normal não pede definição de senha', async () => {
    fake.session = { user: { id: 'u1', email: 'convidado@exemplo.org' } };
    await renderAppWithHash('');
    expect(await screen.findByRole('heading', { name: 'Painel financeiro' })).toBeTruthy();
  });
});

describe('Meu Perfil com Supabase: alteração de senha', () => {
  it('exige a senha atual correta antes de trocar', async () => {
    fake.session = { user: { id: 'u1', email: 'convidado@exemplo.org' } };
    await renderAppWithHash('#/meu-perfil');
    expect(await screen.findByRole('heading', { name: 'Meu Perfil' })).toBeTruthy();
    const fill = (cur: string, next: string, conf: string) => {
      fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: cur } });
      fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: next } });
      fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: conf } });
      fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
    };
    fill('errada', 'NovaSenha2026', 'NovaSenha2026');
    expect(await screen.findByText('Senha atual incorreta.')).toBeTruthy();
    expect(fake.updateUser).not.toHaveBeenCalled();
    fill('SenhaAtual2026', 'curta1', 'curta1');
    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeTruthy();
    fill('SenhaAtual2026', 'NovaSenha2026', 'NovaSenha2026');
    expect(await screen.findByText('Senha alterada com sucesso.')).toBeTruthy();
    expect(fake.signIn).toHaveBeenLastCalledWith({ email: 'convidado@exemplo.org', password: 'SenhaAtual2026' });
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'NovaSenha2026' });
  });
});
