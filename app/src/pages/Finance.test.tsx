import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = ''; });

const dialog = (name: RegExp | string) => screen.getByRole('dialog', { name });
const confirmIn = async (name: RegExp, label: RegExp) => fireEvent.click(within(await screen.findByRole('dialog', { name })).getByRole('button', { name: label }));
const kpi = (label: string) => screen.getByText(label).closest('.kpi')!.querySelector('.kpi-val')!.textContent!;

async function login(role: string, hash: string) {
  window.location.hash = hash;
  render(<App />);
  fireEvent.click(await screen.findByText(role));
}

async function newReceivable(desc: string, amount: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Nova receita/ }));
  const d = dialog('Nova conta a receber');
  const client = within(d).getByLabelText(/^Cliente/) as HTMLSelectElement;
  fireEvent.change(client, { target: { value: client.options[1].value } });
  fireEvent.change(within(d).getByLabelText(/^Descrição/), { target: { value: desc } });
  fireEvent.change(within(d).getByLabelText(/^Valor/), { target: { value: amount } });
  fireEvent.click(within(d).getByRole('button', { name: 'Salvar' }));
  await screen.findByText('Lançamento criado.');
}

async function openRow(desc: string) {
  fireEvent.change(screen.getByPlaceholderText(/Buscar descrição/), { target: { value: desc } });
  fireEvent.click(await screen.findByText(desc));
  return dialog(desc);
}

async function pay(d: HTMLElement, value: string, confirmLabel = /^Registrar$/) {
  fireEvent.change(within(d).getByLabelText('Valor da baixa'), { target: { value } });
  fireEvent.click(within(d).getByRole('button', { name: 'Registrar recebimento' }));
  await confirmIn(/Confirmar recebimento/, confirmLabel);
}

describe('contas a receber: baixas, estorno e cancelamento', () => {
  it('baixa parcial, baixa total, estorno justificado e reflexo no painel', async () => {
    await login('Financeiro', '#/');
    await screen.findByRole('heading', { name: 'Painel financeiro' });
    const receivedBefore = kpi('Receitas recebidas');
    fireEvent.click(screen.getAllByRole('link', { name: /Contas a receber/ })[0]);
    await newReceivable('Teste baixa', '300,00');
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    let d = await openRow('Teste baixa');

    await pay(d, '100,00');
    expect(await screen.findByText('Recebimento registrado.')).toBeTruthy();
    d = dialog('Teste baixa');
    expect(within(d).getByText(/^(Parcial|Vence hoje)$/, { selector: '.badge' })).toBeTruthy();
    expect(within(d).getAllByText('R$ 200,00').length).toBeGreaterThan(0);

    // reenvio do mesmo pagamento: aviso de possível duplicidade antes de gravar
    fireEvent.change(within(d).getByLabelText('Valor da baixa'), { target: { value: '100,00' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Registrar recebimento' }));
    expect(await screen.findByText(/Confirme que não é o mesmo/)).toBeTruthy();
    fireEvent.click(within(dialog(/Confirmar recebimento/)).getByRole('button', { name: 'Cancelar' }));

    await pay(dialog('Teste baixa'), '200,00');
    await waitFor(() => expect(within(dialog('Teste baixa')).getByText('Pago', { selector: '.badge' })).toBeTruthy());

    // estorno exige justificativa e mantém o histórico
    const item200 = within(dialog('Teste baixa')).getAllByText('R$ 200,00', { selector: '.amount-line' })[0].closest('li')!;
    fireEvent.click(within(item200 as HTMLElement).getByRole('button', { name: /Estornar/ }));
    const rev = dialog('Estornar pagamento');
    fireEvent.change(within(rev).getByLabelText(/Justificativa/), { target: { value: 'abc' } });
    fireEvent.click(within(rev).getByRole('button', { name: 'Confirmar estorno' }));
    expect(await screen.findByText(/mínimo de 5 caracteres/)).toBeTruthy();
    fireEvent.change(within(rev).getByLabelText(/Justificativa/), { target: { value: 'Pagamento devolvido pelo banco' } });
    fireEvent.click(within(rev).getByRole('button', { name: 'Confirmar estorno' }));
    expect(await screen.findByText(/Estorno registrado/)).toBeTruthy();
    d = dialog('Teste baixa');
    expect(within(d).getByText('Estornado')).toBeTruthy();
    expect(within(d).getByText(/Pagamento devolvido pelo banco/)).toBeTruthy();
    expect(within(d).getByText(/^(Parcial|Vence hoje)$/, { selector: '.badge' })).toBeTruthy();

    // painel reflete 100 recebidos neste período (200 estornados não contam)
    fireEvent.click(within(d).getAllByRole('button', { name: 'Fechar' }).at(-1)!);
    fireEvent.click(screen.getAllByRole('link', { name: /Painel financeiro/ })[0]);
    await screen.findByRole('heading', { name: 'Painel financeiro' });
    const toNumber = (v: string) => Number(v.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(toNumber(kpi('Receitas recebidas')) - toNumber(receivedBefore)).toBeCloseTo(100, 2);
  });

  it('clique duplo na baixa registra um único pagamento', async () => {
    await login('Financeiro', '#/receber');
    await newReceivable('Teste clique duplo', '50,00');
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    const d = await openRow('Teste clique duplo');
    fireEvent.change(within(d).getByLabelText('Valor da baixa'), { target: { value: '50,00' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Registrar recebimento' }));
    const confirmBtn = within(await screen.findByRole('dialog', { name: /Confirmar recebimento/ })).getByRole('button', { name: /^Registrar$/ });
    await act(async () => { confirmBtn.click(); confirmBtn.click(); });
    await screen.findByText('Recebimento registrado.');
    await waitFor(() => expect(within(dialog('Teste clique duplo')).getAllByText(/R\$ 50,00 · PIX|R\$ 50,00/).length).toBeGreaterThan(0));
    const items = within(dialog('Teste clique duplo')).getAllByText('PIX', { exact: false }).filter((el) => el.closest('li'));
    expect(items.length).toBe(1);
  });

  it('cancelamento com confirmação retira o lançamento dos saldos sem apagar', async () => {
    await login('Financeiro', '#/receber');
    await newReceivable('Teste cancelamento', '80,00');
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    const d = await openRow('Teste cancelamento');
    fireEvent.click(within(d).getByRole('button', { name: 'Cancelar lançamento' }));
    fireEvent.change(within(d).getByLabelText('Motivo do cancelamento'), { target: { value: 'Lançado em duplicidade' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Confirmar cancelamento' }));
    await confirmIn(/Cancelar lançamento\?/, /Cancelar lançamento/);
    expect(await screen.findByText('Lançamento cancelado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cancelados/ }));
    expect(await screen.findByText('Teste cancelamento')).toBeTruthy();
  });
});

describe('contas a pagar', () => {
  it('cadastra despesa recorrente, paga e gera a próxima ocorrência', async () => {
    await login('Financeiro', '#/pagar');
    fireEvent.click(await screen.findByRole('button', { name: /Nova despesa/ }));
    const d = dialog('Nova conta a pagar');
    fireEvent.change(within(d).getByLabelText(/^Descrição/), { target: { value: 'Despesa recorrente teste' } });
    fireEvent.change(within(d).getByLabelText(/^Valor/), { target: { value: '120,00' } });
    fireEvent.change(within(d).getByLabelText('Recorrência'), { target: { value: 'mensal' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Lançamento criado.');
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    const det = await openRow('Despesa recorrente teste');
    fireEvent.click(within(det).getByRole('button', { name: 'Registrar pagamento' }));
    await confirmIn(/Confirmar pagamento/, /^Registrar$/);
    expect(await screen.findByText('Pagamento registrado.')).toBeTruthy();
    expect(await screen.findByText(/Próxima ocorrência gerada/)).toBeTruthy();
  });
});

describe('cobranças', () => {
  it('gera cobrança de uma conta, impede duplicidade e dá baixa pela cobrança', async () => {
    await login('Financeiro', '#/receber');
    await newReceivable('Conta para cobrar', '90,00');
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    let d = await openRow('Conta para cobrar');
    fireEvent.click(within(d).getByRole('button', { name: /Gerar cobrança desta conta/ }));
    const nova = await screen.findByRole('dialog', { name: 'Nova cobrança' });
    expect((within(nova).getByLabelText('Valor da cobrança') as HTMLInputElement).value).toBe('90,00');
    fireEvent.click(within(nova).getByRole('button', { name: 'Gerar cobrança' }));
    await confirmIn(/Gerar cobrança\?/, /Gerar cobrança/);
    expect(await screen.findByText('Cobrança gerada.')).toBeTruthy();
    const det = await screen.findByRole('dialog', { name: /^Cobrança COB-/ });
    const code = det.getAttribute('aria-label')!.replace('Cobrança ', '');
    expect(code).toMatch(/^COB-\d{4}-\d{5}$/);
    fireEvent.click(within(det).getByRole('button', { name: 'Registrar recebimento' }));
    await confirmIn(/Confirmar recebimento/, /^Registrar$/);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: `Cobrança ${code}` })).getByText('Paga', { selector: '.badge' })).toBeTruthy());
    fireEvent.click(within(screen.getByRole('dialog', { name: `Cobrança ${code}` })).getAllByRole('button', { name: 'Fechar' }).at(-1)!);
    // a mesma conta não aparece mais como elegível para nova cobrança
    fireEvent.click(screen.getAllByRole('link', { name: /Contas a receber/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Todos/ }));
    d = await openRow('Conta para cobrar');
    expect(within(d).getByText(`Cobrança ${code}`)).toBeTruthy();
    expect(within(d).queryByRole('button', { name: /Gerar cobrança desta conta/ })).toBeNull();
  });

  it('perfil consulta não registra baixa nem gera cobrança', async () => {
    await login('Consulta', '#/cobrancas');
    await screen.findByRole('heading', { name: 'Cobranças' });
    expect(screen.queryByRole('button', { name: /Nova cobrança/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('row')[1]);
    const det = await screen.findByRole('dialog', { name: /^Cobrança COB-/ });
    expect(within(det).queryByRole('button', { name: /Registrar recebimento/ })).toBeNull();
    expect(within(det).queryByRole('button', { name: /Estornar/ })).toBeNull();
  });
});
