import { addDays, addMonths, diffDays, round2 } from './format';
import type { Payable, Receivable, Recurrence } from './types';

type Account = Pick<Receivable | Payable, 'amount' | 'paid_amount' | 'due_date' | 'canceled_at'>;
export type AccountStatus = 'pago' | 'parcial' | 'pendente' | 'vence_hoje' | 'vencido' | 'inadimplente' | 'cancelado';

/** Dias de atraso a partir dos quais uma conta a receber é considerada inadimplente. */
export const DELINQUENCY_DAYS = 30;

export const openAmount = (a: Pick<Account, 'amount' | 'paid_amount'>) => Math.max(0, round2(a.amount - a.paid_amount));

export function accountStatus(a: Account, todayIso: string, { delinquency = false } = {}): AccountStatus {
  if (a.canceled_at) return 'cancelado';
  if (openAmount(a) === 0) return 'pago';
  const late = diffDays(todayIso, a.due_date);
  if (late > 0) return delinquency && late > DELINQUENCY_DAYS ? 'inadimplente' : 'vencido';
  if (late === 0) return 'vence_hoje';
  return a.paid_amount > 0 ? 'parcial' : 'pendente';
}

export const STATUS_META: Record<AccountStatus, { label: string; tone: string }> = {
  pago: { label: 'Pago', tone: 'success' },
  parcial: { label: 'Parcial', tone: 'info' },
  pendente: { label: 'A vencer', tone: 'primary' },
  vence_hoje: { label: 'Vence hoje', tone: 'warning' },
  vencido: { label: 'Vencido', tone: 'danger' },
  inadimplente: { label: 'Inadimplente', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};

/** Valida um novo pagamento contra o saldo (mesma regra do trigger sync_paid_amount). */
export function validatePayment(a: Account, value: number): string | null {
  if (a.canceled_at) return 'Conta cancelada não pode receber pagamentos.';
  if (!(value > 0)) return 'Informe um valor maior que zero.';
  if (round2(a.paid_amount + value) > a.amount) return `O valor excede o saldo em aberto (${openAmount(a).toFixed(2)}).`;
  return null;
}

export function nextRecurrenceDate(due: string, recurrence: Recurrence): string | null {
  switch (recurrence) {
    case 'mensal': return addMonths(due, 1);
    case 'trimestral': return addMonths(due, 3);
    case 'anual': return addMonths(due, 12);
    default: return null;
  }
}

export interface Period { from: string; to: string }
export const inPeriod = (d: string, p: Period) => d >= p.from && d <= p.to;

export interface DashboardSummary {
  receivedInPeriod: number;
  paidInPeriod: number;
  balance: number;
  toReceive: number;
  toPay: number;
  overdueReceivable: number;
  overduePayable: number;
  delinquentCount: number;
  upcoming: { kind: 'receber' | 'pagar'; id: string; description: string; due_date: string; open: number; party_id: string | null }[];
  monthly: { month: string; receitas: number; despesas: number }[];
}

interface Paid { paid_at: string; amount: number }

export function dashboardSummary(input: {
  receivables: Receivable[];
  payables: Payable[];
  receivablePayments: Paid[];
  payablePayments: Paid[];
  period: Period;
  today: string;
  upcomingDays?: number;
}): DashboardSummary {
  const { receivables, payables, receivablePayments, payablePayments, period, today, upcomingDays = 7 } = input;
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const active = <T extends Account>(xs: T[]) => xs.filter((x) => !x.canceled_at);

  const receivedInPeriod = sum(receivablePayments.filter((p) => inPeriod(p.paid_at, period)).map((p) => p.amount));
  const paidInPeriod = sum(payablePayments.filter((p) => inPeriod(p.paid_at, period)).map((p) => p.amount));
  const recOpen = active(receivables).filter((r) => openAmount(r) > 0);
  const payOpen = active(payables).filter((r) => openAmount(r) > 0);

  const limit = addDays(today, upcomingDays);
  const upcoming = [
    ...recOpen.filter((r) => r.due_date >= today && r.due_date <= limit)
      .map((r) => ({ kind: 'receber' as const, id: r.id, description: r.description, due_date: r.due_date, open: openAmount(r), party_id: r.party_id })),
    ...payOpen.filter((r) => r.due_date >= today && r.due_date <= limit)
      .map((r) => ({ kind: 'pagar' as const, id: r.id, description: r.description, due_date: r.due_date, open: openAmount(r), party_id: r.party_id })),
  ].sort((a, b) => a.due_date.localeCompare(b.due_date));

  // últimos 6 meses até o fim do período
  const months: string[] = [];
  const endMonth = period.to.slice(0, 7) + '-01';
  for (let i = 5; i >= 0; i--) months.push(addMonths(endMonth, -i).slice(0, 7));
  const monthly = months.map((m) => ({
    month: m,
    receitas: sum(receivablePayments.filter((p) => p.paid_at.startsWith(m)).map((p) => p.amount)),
    despesas: sum(payablePayments.filter((p) => p.paid_at.startsWith(m)).map((p) => p.amount)),
  }));

  return {
    receivedInPeriod,
    paidInPeriod,
    balance: round2(receivedInPeriod - paidInPeriod),
    toReceive: sum(recOpen.map(openAmount)),
    toPay: sum(payOpen.map(openAmount)),
    overdueReceivable: sum(recOpen.filter((r) => r.due_date < today).map(openAmount)),
    overduePayable: sum(payOpen.filter((r) => r.due_date < today).map(openAmount)),
    delinquentCount: new Set(recOpen.filter((r) => diffDays(today, r.due_date) > DELINQUENCY_DAYS).map((r) => r.party_id)).size,
    upcoming,
    monthly,
  };
}

export const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Cheque'];
