import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = ''; });

const CSV = [
  'Insc. Estadual;Nome do Produtor;CPF/CNPJ;Valor (R$);Vencimento;Competência',
  '281112223;Produtor da Planilha;;150,00;10/12/2026;11/2026',
  '281112223;Produtor da Planilha;;150,00;10/12/2026;11/2026',
  '283123452;Linha com IE errada;;10,00;10/12/2026;11/2026',
].join('\r\n');

async function upload(content = CSV, name = 'estado-novembro.csv') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('Correspondência das colunas');
}

describe('importação de planilhas', () => {
  it('mapeia, mostra a prévia, grava após confirmação e não duplica ao reimportar', async () => {
    window.location.hash = '#/importacao';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    await screen.findByRole('heading', { name: 'Importar planilhas' });
    await upload();
    // colunas sugeridas automaticamente
    expect((screen.getByLabelText(/^Inscrição estadual/) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Insc. Estadual');
    expect((screen.getByLabelText(/^Valor/) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Valor (R$)');
    fireEvent.click(screen.getByLabelText('Gerar cobrança para cada conta'));
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));

    // prévia: nada gravado ainda
    expect(await screen.findByText(/Nenhum dado foi gravado ainda/)).toBeTruthy();
    expect(screen.getByText(/Lançamento repetido no próprio arquivo/)).toBeTruthy();
    expect(screen.getByText(/inválida para MS/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e importar/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirmar importação?' })).getByRole('button', { name: /Importar/ }));
    expect(await screen.findByText(/Importação concluída com erros/i)).toBeTruthy();
    const kv = (label: string) => screen.getByText(label).nextElementSibling!.textContent;
    expect(kv('Cadastros criados')).toBe('1');
    expect(kv('Contas a receber geradas')).toBe('1');
    expect(kv('Cobranças geradas')).toBe('1');
    expect(kv('Com erro')).toBe('1');

    // reimportar o mesmo arquivo
    fireEvent.click(screen.getByRole('button', { name: 'Nova importação' }));
    await upload();
    expect(screen.getByText(/Este arquivo já foi importado/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));
    await screen.findByText(/Nenhum dado foi gravado ainda/);
    expect(screen.getAllByText(/já importado anteriormente/).length).toBeGreaterThan(0);

    // histórico com linha a linha
    fireEvent.click(screen.getByRole('tab', { name: /Histórico/ }));
    fireEvent.click(await screen.findByText('estado-novembro.csv'));
    const detail = await screen.findByRole('dialog', { name: /Importação: estado-novembro.csv/ });
    await waitFor(() => expect(within(detail).getAllByText('Cadastro criado').length).toBe(1));
    // as duas linhas do mesmo produtor apontam para o mesmo cadastro
    expect(within(detail).getAllByRole('link', { name: 'Produtor da Planilha' })).toHaveLength(2);
  });

  it('pede confirmação quando só o nome coincide e respeita a decisão de ignorar', async () => {
    window.location.hash = '#/importacao';
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    await screen.findByRole('heading', { name: 'Importar planilhas' });
    await upload('Nome;Valor;Vencimento\r\nMarina Albuquerque;20,00;10/12/2026', 'so-nome.csv');
    fireEvent.click(screen.getByRole('button', { name: /Analisar planilha/ }));
    await screen.findByText(/aguardam sua confirmação/);
    const decision = screen.getByLabelText('Decisão da linha 2') as HTMLSelectElement;
    expect(Array.from(decision.options).some((o) => /Associar a Marina Albuquerque/.test(o.textContent ?? ''))).toBe(true);
    fireEvent.change(decision, { target: { value: 'skip' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e importar/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Confirmar importação?' })).getByRole('button', { name: /Importar/ }));
    await screen.findByText(/Importação concluída/i);
    expect(screen.getByText('Ignoradas').nextElementSibling!.textContent).toBe('1');
    expect(screen.getByText('Contas a receber geradas').nextElementSibling!.textContent).toBe('0');
  });

  it('perfil consulta não acessa a importação', async () => {
    window.location.hash = '#/importacao';
    render(<App />);
    fireEvent.click(await screen.findByText('Consulta'));
    expect(await screen.findByRole('heading', { name: 'Painel financeiro' })).toBeTruthy();
  });
});
