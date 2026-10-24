import { describe, expect, it } from 'vitest';
import { buildChargeStatement } from './pdf';
import { chargeStatus } from './finance';

describe('demonstrativo de cobrança (PDF)', () => {
  it('gera PDF com identificação da ASSOCIAPEC, cliente, valores e aviso de que não é boleto', async () => {
    const doc = await buildChargeStatement({
      code: 'COB-2026-00001', statusLabel: 'Pendente', description: 'Mensalidade 10/2026', dueDate: '2026-10-30',
      amount: 250, paid: 50, open: 200, notes: null,
      client: { name: 'Produtor Exemplo', document: '52998224725', ie: 'MS 28.312.345-1', address: 'Fazenda Exemplo, Campo Grande/MS', email: null },
      payments: [{ paid_at: '2026-10-05', amount: 50, method: 'PIX' }],
    }, null);
    const raw = doc.output();
    expect(raw.startsWith('%PDF')).toBe(true);
    for (const t of ['ASSOCIAPEC', 'DEMONSTRATIVO DE COBRAN', 'COB-2026-00001', 'Produtor Exemplo', '529.982.247-25', 'MS 28.312.345-1', '30/10/2026', 'boleto']) {
      expect(raw).toContain(t);
    }
  });
});

describe('situação da cobrança', () => {
  const base = { canceled_at: null, due_date: '2026-10-30', amount: 100 };
  const rec = (paid: number) => ({ amount: 100, paid_amount: paid, canceled_at: null });
  it('deriva a situação da conta a receber', () => {
    expect(chargeStatus(base, rec(0), '2026-10-24')).toBe('pendente');
    expect(chargeStatus(base, rec(40), '2026-10-24')).toBe('parcial');
    expect(chargeStatus(base, rec(100), '2026-10-24')).toBe('paga');
    expect(chargeStatus(base, rec(40), '2026-11-02')).toBe('vencida');
    expect(chargeStatus({ ...base, canceled_at: 'x' }, rec(0), '2026-10-24')).toBe('cancelada');
  });
});
