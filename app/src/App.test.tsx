import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); window.location.hash = ''; });

describe('aplicação (modo demonstração)', () => {
  it('exige login e mostra o painel após escolher um perfil', async () => {
    render(<App />);
    expect(await screen.findByText('Modo demonstração')).toBeTruthy();
    fireEvent.click(screen.getByText('Financeiro'));
    expect(await screen.findByRole('heading', { name: 'Painel financeiro' })).toBeTruthy();
    expect(screen.getByText('Receitas recebidas')).toBeTruthy();
    // financeiro não vê o menu de administração
    expect(screen.queryByText('Usuários e perfis')).toBeNull();
  });

  it('perfil consulta não vê botões de inclusão', async () => {
    window.location.hash = '#/receber';
    render(<App />);
    fireEvent.click(await screen.findByText('Consulta'));
    expect(await screen.findByRole('heading', { name: 'Contas a receber' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nova receita/ })).toBeNull();
  });
});
