import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('cadastra um cliente com validação de CNPJ', async () => {
    window.location.hash = '#/cadastros/pessoas';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    fireEvent.click(await screen.findByRole('button', { name: /Novo cadastro/ }));
    fireEvent.change(screen.getByLabelText(/Razão social/), { target: { value: 'Cliente de Teste Ltda' } });
    fireEvent.change(screen.getByLabelText(/^CNPJ/), { target: { value: '11222333000180' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('CNPJ inválido')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^CNPJ/), { target: { value: '11222333000181' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Cadastro criado.')).toBeTruthy());
    expect(screen.getByText('Cliente de Teste Ltda')).toBeTruthy();
  });

  it('perfil consulta não vê botões de inclusão', async () => {
    window.location.hash = '#/receber';
    render(<App />);
    fireEvent.click(await screen.findByText('Consulta'));
    expect(await screen.findByRole('heading', { name: 'Contas a receber' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nova receita/ })).toBeNull();
  });
});
