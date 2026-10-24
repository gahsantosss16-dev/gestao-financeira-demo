import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { getInitials } from './UserMenu';

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = ''; });

describe('Topbar e Meu Perfil', () => {
  it('iniciais seguem o padrão do Neuro Hub Pro', () => {
    expect(getInitials('Ana Maria Administradora')).toBe('AA');
    expect(getInitials('Bruno')).toBe('B');
    expect(getInitials('  ')).toBe('?');
  });

  it('usuário fica na Topbar (não no rodapé do menu) e o menu leva ao Meu Perfil', async () => {
    window.location.hash = '#/';
    render(<App />);
    fireEvent.click(await screen.findByText('Administrador'));
    await screen.findByRole('heading', { name: 'Painel financeiro' });
    const sidebar = screen.getByRole('complementary', { name: 'Menu principal' });
    expect(within(sidebar).queryByText('Ana Administradora')).toBeNull();
    const trigger = screen.getByRole('button', { name: /Menu do usuário Ana Administradora/ });
    expect(within(trigger).getByText('Administrador')).toBeTruthy();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Opções do usuário' });
    expect(within(menu).getByText('admin@demo.local')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Meu Perfil' }));
    expect(await screen.findByRole('heading', { name: 'Meu Perfil' })).toBeTruthy();
    // perfil de acesso é somente leitura
    expect((screen.getByLabelText(/^Perfil de acesso/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^E-mail/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Souza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Nome atualizado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Menu do usuário Ana Souza/ })).toBeTruthy();
  });

  it('Sair encerra a sessão', async () => {
    window.location.hash = '#/';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    fireEvent.click(await screen.findByRole('button', { name: /Menu do usuário/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Sair' }));
    expect(await screen.findByText('Modo demonstração')).toBeTruthy();
  });
});
