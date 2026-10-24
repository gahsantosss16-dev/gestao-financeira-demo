import { describe, expect, it } from 'vitest';
import { accountStatus, dashboardSummary, nextRecurrenceDate, openAmount, validatePayment } from './finance';
import { addMonths, parseMoney } from './format';
import type { Payable, Receivable } from './types';

const T = '2026-10-24';
const acc = (o: Partial<Receivable>): Receivable => ({
  id: 'r', party_id: 'p', category_id: null, service_id: null, description: 'x', document_number: null, issue_date: T,
  due_date: T, amount: 100, paid_amount: 0, canceled_at: null, cancel_reason: null, notes: null, ...o,
});

describe('situação das contas', () => {
  it('classifica por vencimento e pagamento', () => {
    expect(accountStatus(acc({ due_date: '2026-11-01' }), T)).toBe('pendente');
    expect(accountStatus(acc({ due_date: '2026-11-01', paid_amount: 40 }), T)).toBe('parcial');
    expect(accountStatus(acc({}), T)).toBe('vence_hoje');
    expect(accountStatus(acc({ due_date: '2026-10-20' }), T)).toBe('vencido');
    expect(accountStatus(acc({ paid_amount: 100 }), T)).toBe('pago');
    expect(accountStatus(acc({ canceled_at: '2026-10-01' }), T)).toBe('cancelado');
  });
  it('marca inadimplência após 30 dias apenas quando solicitado', () => {
    const old = acc({ due_date: '2026-09-20' });
    expect(accountStatus(old, T)).toBe('vencido');
    expect(accountStatus(old, T, { delinquency: true })).toBe('inadimplente');
    expect(accountStatus(acc({ due_date: '2026-09-24' }), T, { delinquency: true })).toBe('vencido');
  });
  it('valida pagamentos parciais e excedentes', () => {
    const a = acc({ paid_amount: 60 });
    expect(openAmount(a)).toBe(40);
    expect(validatePayment(a, 40)).toBeNull();
    expect(validatePayment(a, 40.01)).toMatch(/excede/);
    expect(validatePayment(a, 0)).toMatch(/maior que zero/);
    expect(validatePayment(acc({ canceled_at: 'x' }), 10)).toMatch(/cancelada/);
  });
  it('calcula a próxima recorrência respeitando fim de mês', () => {
    expect(nextRecurrenceDate('2026-01-31', 'mensal')).toBe('2026-02-28');
    expect(nextRecurrenceDate('2026-10-10', 'trimestral')).toBe('2027-01-10');
    expect(nextRecurrenceDate('2026-10-10', 'anual')).toBe('2027-10-10');
    expect(nextRecurrenceDate('2026-10-10', 'nenhuma')).toBeNull();
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
  });
  it('interpreta valores monetários em formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('R$ 99,9')).toBe(99.9);
    expect(parseMoney('1234.5')).toBe(1234.5);
    expect(parseMoney('abc')).toBeNaN();
    expect(parseMoney('')).toBeNaN();
  });
});

describe('painel financeiro', () => {
  it('agrega receitas, despesas, vencidos e próximos vencimentos', () => {
    const pay = (o: Partial<Payable>): Payable => ({ ...acc({}), recurrence: 'nenhuma', recurrence_parent_id: null, ...o } as Payable);
    const s = dashboardSummary({
      today: T,
      period: { from: '2026-10-01', to: T },
      receivables: [
        acc({ id: 'a', amount: 300, paid_amount: 100, due_date: '2026-09-01', party_id: 'p1' }),
        acc({ id: 'b', amount: 200, due_date: '2026-10-28', party_id: 'p2' }),
        acc({ id: 'c', amount: 999, due_date: '2026-09-01', canceled_at: 'x' }),
      ],
      payables: [pay({ id: 'd', amount: 50, due_date: '2026-10-20' }), pay({ id: 'e', amount: 80, due_date: '2026-10-25' })],
      receivablePayments: [{ paid_at: '2026-10-05', amount: 100 }, { paid_at: '2026-08-01', amount: 70 }, { paid_at: '2026-10-07', amount: 999, reversed_at: '2026-10-08' }],
      payablePayments: [{ paid_at: '2026-10-06', amount: 30 }],
    });
    expect(s.receivedInPeriod).toBe(100);
    expect(s.paidInPeriod).toBe(30);
    expect(s.balance).toBe(70);
    expect(s.toReceive).toBe(400);
    expect(s.overdueReceivable).toBe(200);
    expect(s.overduePayable).toBe(50);
    expect(s.delinquentCount).toBe(1);
    expect(s.upcoming.map((u) => u.id)).toEqual(['e', 'b']);
    expect(s.monthly).toHaveLength(6);
    expect(s.monthly.at(-1)).toEqual({ month: '2026-10', receitas: 100, despesas: 30 });
  });
});
