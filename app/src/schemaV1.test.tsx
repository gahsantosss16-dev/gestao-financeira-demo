// Ambiente publicado antes da migração operacional: o app não pode quebrar.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { DemoSource } from './data/demoSource';

beforeEach(() => { vi.spyOn(DemoSource.prototype, 'schemaVersion').mockResolvedValue(1); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); window.location.hash = ''; });

describe('banco sem a migração operacional (versão 1)', () => {
  it('Cobranças e Importação mostram aviso de atualização pendente', async () => {
    window.location.hash = '#/cobrancas';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    expect(await screen.findByText(/O módulo de Cobranças/)).toBeTruthy();
    expect(screen.getByText(/aguarda/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('link', { name: /Importar planilhas/ })[0]);
    expect(await screen.findByText(/A importação de planilhas/)).toBeTruthy();
  });

  it('contas a receber continuam funcionando sem o botão de gerar cobrança', async () => {
    window.location.hash = '#/receber?status=todos';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    fireEvent.click((await screen.findAllByRole('row'))[1]);
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: /Gerar cobrança/ })).toBeNull();
    expect(within(d).getByText('Histórico de pagamentos')).toBeTruthy();
  });

  it('cadastro grava a IE principal no campo existente', async () => {
    window.location.hash = '#/cadastros/pessoas';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    fireEvent.click(await screen.findByRole('button', { name: /Novo cadastro/ }));
    const d = screen.getByRole('dialog', { name: 'Novo cadastro' });
    expect(within(d).queryByText('Outras propriedades / inscrições')).toBeNull();
    fireEvent.change(within(d).getByLabelText(/^Inscrição Estadual/), { target: { value: '281112223' } });
    fireEvent.change(within(d).getByLabelText(/^Nome completo/), { target: { value: 'Produtor Versão Um' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Cadastro criado.')).toBeTruthy();
    expect(await screen.findByText('281112223')).toBeTruthy();
  });
});
