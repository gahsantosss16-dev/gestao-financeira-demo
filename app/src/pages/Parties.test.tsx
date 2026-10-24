import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); window.location.hash = ''; });

async function openForm(role = 'Financeiro') {
  window.location.hash = '#/cadastros/pessoas';
  render(<App />);
  fireEvent.click(await screen.findByText(role));
  fireEvent.click(await screen.findByRole('button', { name: /Novo cadastro/ }));
  return screen.getByRole('dialog', { name: 'Novo cadastro' });
}
const save = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

describe('cadastro de clientes e produtores', () => {
  it('abre com a inscrição estadual em destaque, antes de CPF/CNPJ e nome', async () => {
    const dialog = await openForm();
    const labels = Array.from(dialog.querySelectorAll('label')).map((l) => l.textContent ?? '');
    const pos = (t: RegExp) => labels.findIndex((l) => t.test(l));
    expect(pos(/^UF da inscrição/)).toBeGreaterThan(-1);
    expect(pos(/^UF da inscrição/)).toBeLessThan(pos(/^Inscrição Estadual/));
    expect(pos(/^Inscrição Estadual/)).toBeLessThan(pos(/^CPF/));
    expect(pos(/^CPF/)).toBeLessThan(pos(/^Nome completo/));
    expect(within(dialog).getByRole('button', { name: /Consultar IE/ })).toBeTruthy();
  });

  it('valida a IE pela regra da UF e cadastra o produtor', async () => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^Inscrição Estadual/), { target: { value: '283123452' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nome completo/), { target: { value: 'Produtor de Teste' } });
    save(dialog);
    expect(await within(dialog).findByText(/inválida para MS/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Inscrição Estadual/), { target: { value: '283123451' } });
    expect((within(dialog).getByLabelText(/^Inscrição Estadual/) as HTMLInputElement).value).toBe('28.312.345-1');
    save(dialog);
    expect(await screen.findByText('Cadastro criado.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: '283123451' } });
    expect(await screen.findByText('Produtor de Teste')).toBeTruthy();
    expect(screen.getByText('MS 28.312.345-1')).toBeTruthy();
  });

  it('alerta e bloqueia IE já cadastrada para outro produtor (UF + IE)', async () => {
    const dialog = await openForm();
    // primeiro cadastro
    fireEvent.change(within(dialog).getByLabelText(/^Inscrição Estadual/), { target: { value: '287654320' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nome completo/), { target: { value: 'Primeiro Produtor' } });
    save(dialog);
    await screen.findByText('Cadastro criado.');
    fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
    const second = screen.getByRole('dialog', { name: 'Novo cadastro' });
    fireEvent.change(within(second).getByLabelText(/^Inscrição Estadual/), { target: { value: '287654320' } });
    expect(await within(second).findByText(/já pertence a Primeiro Produtor/)).toBeTruthy();
    fireEvent.change(within(second).getByLabelText(/^Nome completo/), { target: { value: 'Segundo Produtor' } });
    save(second);
    await waitFor(() => expect(screen.getAllByText(/já pertence a Primeiro Produtor/).length).toBeGreaterThan(0));
    expect(screen.queryByText('Segundo Produtor')).toBeNull();
    // a mesma numeração em outra UF é outro contribuinte: não alerta
    fireEvent.change(within(second).getByLabelText('UF da inscrição'), { target: { value: 'GO' } });
    await waitFor(() => expect(within(second).queryByText(/já pertence/)).toBeNull());
  });

  it('fornecedor sem IE: cadastro por CNPJ com validação e bloqueio de duplicidade', async () => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText('Tipo de cadastro'), { target: { value: 'fornecedor' } });
    fireEvent.click(within(dialog).getByLabelText('Produtor rural'));
    fireEvent.click(within(dialog).getByLabelText('Sem inscrição estadual'));
    expect(within(dialog).queryByLabelText(/^Inscrição Estadual/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Pessoa'), { target: { value: 'PJ' } });
    fireEvent.change(within(dialog).getByLabelText(/^CNPJ/), { target: { value: '11222333000180' } });
    fireEvent.change(within(dialog).getByLabelText(/^Razão social/), { target: { value: 'Fornecedor Teste Ltda' } });
    save(dialog);
    expect(await within(dialog).findByText('CNPJ inválido')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^CNPJ/), { target: { value: '11222333000181' } });
    save(dialog);
    expect(await screen.findByText('Cadastro criado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Novo cadastro/ }));
    const again = screen.getByRole('dialog', { name: 'Novo cadastro' });
    fireEvent.change(within(again).getByLabelText('Pessoa'), { target: { value: 'PJ' } });
    fireEvent.change(within(again).getByLabelText(/^CNPJ/), { target: { value: '11222333000181' } });
    expect(await within(again).findByText(/Já existe um cadastro com este CNPJ: Fornecedor Teste Ltda/)).toBeTruthy();
  });

  it('edita sem perder dados e inativa sem apagar o histórico financeiro', async () => {
    window.location.hash = '#/cadastros/pessoas';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    const row = (await screen.findAllByRole('row')).find((r) => /Produtor rural/.test(r.textContent ?? '') && /MS/.test(r.textContent ?? ''))!;
    const name = within(row).getAllByText(/./)[0].textContent!.replace(/Produtor rural.*/, '').trim();
    fireEvent.click(row);
    const dialog = screen.getByRole('dialog', { name: 'Editar cadastro' });
    const ieBefore = (within(dialog).getByLabelText(/^Inscrição Estadual/) as HTMLInputElement).value;
    fireEvent.change(within(dialog).getByLabelText('Pessoa de contato'), { target: { value: 'Gerente da fazenda' } });
    save(dialog);
    expect(await screen.findByText('Cadastro atualizado.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('row').find((r) => (r.textContent ?? '').includes(name))!);
    const reopened = screen.getByRole('dialog', { name: 'Editar cadastro' });
    expect((within(reopened).getByLabelText(/^Inscrição Estadual/) as HTMLInputElement).value).toBe(ieBefore);
    expect((within(reopened).getByLabelText('Pessoa de contato') as HTMLInputElement).value).toBe('Gerente da fazenda');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Cancelar' }));
    const target = screen.getAllByRole('row').find((r) => (r.textContent ?? '').includes(name))!;
    fireEvent.click(within(target).getByRole('button', { name: 'Inativar' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: /Inativar/ })).getByRole('button', { name: 'Inativar' }));
    expect(await screen.findByText('Cadastro inativado.')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByRole('row').some((r) => (r.textContent ?? '').includes(name))).toBe(false));
    fireEvent.click(screen.getByLabelText('Mostrar inativos'));
    expect(screen.getAllByRole('row').find((r) => (r.textContent ?? '').includes(name))!.textContent).toMatch(/Inativo/);
  });
});
