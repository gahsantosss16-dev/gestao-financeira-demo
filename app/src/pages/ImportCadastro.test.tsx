import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = ''; });

async function uploadCsv(content: string, name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([content], name, { type: 'text/csv' })] } });
  await screen.findByText('Correspondência das colunas');
  fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));
  await screen.findByText(/Nenhum dado foi gravado ainda/);
}
async function confirmImport() {
  fireEvent.click(screen.getByRole('button', { name: /Confirmar e importar/ }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirmar importação?' })).getByRole('button', { name: /Importar/ }));
  await screen.findByText(/Importação concluída/i);
}
async function openPartyByIe(ie: string) {
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: ie } });
  fireEvent.click((await screen.findAllByRole('row'))[1]);
  return screen.findByRole('dialog', { name: 'Editar cadastro' });
}

describe('importação integrada ao cadastro', () => {
  it('Importar clientes abre o mesmo importador com foco cadastral e só atualiza diferenças aprovadas', async () => {
    window.location.hash = '#/cadastros/pessoas';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    // cadastro existente com e-mail
    fireEvent.click(await screen.findByRole('button', { name: /Novo cadastro/ }));
    let d = screen.getByRole('dialog', { name: 'Novo cadastro' });
    fireEvent.change(within(d).getByLabelText(/^Inscrição Estadual/), { target: { value: '287654320' } });
    fireEvent.change(within(d).getByLabelText(/^Nome completo/), { target: { value: 'Produtor Conferência' } });
    fireEvent.change(within(d).getByLabelText('E-mail'), { target: { value: 'antigo@exemplo.com' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Cadastro criado.');

    fireEvent.click(screen.getByRole('link', { name: /Importar clientes/ }));
    expect(await screen.findByRole('heading', { name: 'Importar clientes' })).toBeTruthy();
    const csv = 'Inscrição Estadual;Nome;E-mail;Telefone\r\n287654320;Produtor Conferência;novo@exemplo.com;67999990000';
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], 'clientes.csv', { type: 'text/csv' })] } });
    await screen.findByText('Correspondência das colunas');
    // foco cadastral: sem lançamentos por padrão
    expect((screen.getByLabelText(/Gerar contas a receber/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));
    await screen.findByText(/Nenhum dado foi gravado ainda/);
    expect(screen.getByText(/Diferenças com o cadastro/)).toBeTruthy();
    expect(screen.getByText('antigo@exemplo.com')).toBeTruthy(); // valor atual riscado
    // sem aprovar nada: cadastro permanece igual
    await confirmImport();
    expect(screen.getByText('Cadastros atualizados').nextElementSibling!.textContent).toBe('0');
    fireEvent.click(screen.getByRole('link', { name: /Voltar a Clientes e fornecedores/ }));
    d = await openPartyByIe('287654320');
    expect((within(d).getByLabelText('E-mail') as HTMLInputElement).value).toBe('antigo@exemplo.com');
    fireEvent.click(within(d).getAllByRole('button', { name: 'Fechar' }).at(-1) ?? within(d).getByRole('button', { name: 'Cancelar' }));

    // nova importação aprovando só o telefone (campo vazio)
    fireEvent.click(screen.getByRole('link', { name: /Importar clientes/ }));
    await screen.findByRole('heading', { name: 'Importar clientes' });
    await uploadCsv(csv, 'clientes.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar só campos vazios' }));
    expect((screen.getByLabelText('Atualizar Telefone da linha 2') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Atualizar E-mail da linha 2') as HTMLInputElement).checked).toBe(false);
    await confirmImport();
    expect(screen.getByText('Cadastros atualizados').nextElementSibling!.textContent).toBe('1');
    fireEvent.click(screen.getByRole('link', { name: /Voltar a Clientes e fornecedores/ }));
    d = await openPartyByIe('287654320');
    expect((within(d).getByLabelText('E-mail') as HTMLInputElement).value).toBe('antigo@exemplo.com');
    expect((within(d).getByLabelText('Telefone') as HTMLInputElement).value).toBe('(67) 99999-0000');
  });
});
