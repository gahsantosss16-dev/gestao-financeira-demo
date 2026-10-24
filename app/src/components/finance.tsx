// Baixa, histórico e estorno de pagamentos — compartilhados por Contas a receber,
// Contas a pagar e Cobranças (mesma função, mesmo comportamento em todas as telas).
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useMutation, useSchemaV2 } from '../data/DataContext';
import { nextRecurrenceDate, openAmount, PAYMENT_METHODS, validatePayment } from '../lib/finance';
import { brl, fdate, fdatetime, parseMoney, round2, today } from '../lib/format';
import { can } from '../lib/permissions';
import type { Payable, Payment, Receivable } from '../lib/types';
import { useFeedback } from './Feedback';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { MoneyInput, TextInput } from './TextInput';
import { Badge, Field } from './ui';

export type FinKind = 'receber' | 'pagar';
type Account = Receivable | Payable;
export interface PaymentInput { paid_at: string; amount: number; method: string; notes: string | null }

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Operações financeiras com validação, confirmação e proteção contra duplicidade. */
export function usePaymentOps() {
  const { confirm, toast } = useFeedback();
  const { run, busy } = useMutation();
  const { profile } = useAuth();
  const v2 = useSchemaV2();
  const canReverse = v2 ? can(profile?.role, 'write', 'receivable_payments') : profile?.role === 'admin';

  async function pay(kind: FinKind, account: Account, input: PaymentInput, requestId: string, existing: Payment[]): Promise<boolean> {
    const isRec = kind === 'receber';
    const problem = validatePayment(account, input.amount);
    if (problem) { toast(problem, 'error'); return false; }
    if (input.paid_at > today()) { toast('A data do pagamento não pode ser futura.', 'error'); return false; }
    const remaining = round2(openAmount(account) - input.amount);
    // mesma data, valor e forma já registrados: provável duplicidade
    const similar = existing.find((p) => !p.reversed_at && p.paid_at === input.paid_at && p.amount === input.amount && p.method === input.method);
    if (!(await confirm({
      title: isRec ? 'Confirmar recebimento' : 'Confirmar pagamento',
      message: <>
        {similar && <div className="callout tone-warning mb-sm"><Icon name="alert" /><div>Já existe um {isRec ? 'recebimento' : 'pagamento'} de <b>{brl(similar.amount)}</b> em {fdate(similar.paid_at)} via {similar.method}. Confirme que não é o mesmo.</div></div>}
        Registrar <b>{brl(input.amount)}</b> em {fdate(input.paid_at)} via {input.method}.<br />
        {remaining > 0 ? <>Restará <b>{brl(remaining)}</b> em aberto (baixa parcial).</> : 'A conta ficará quitada (baixa total).'}
      </>,
      confirmLabel: similar ? 'Registrar mesmo assim' : 'Registrar',
    }))) return false;
    const payTable = isRec ? 'receivable_payments' : 'payable_payments';
    const row = { [isRec ? 'receivable_id' : 'payable_id']: account.id, ...input, ...(v2 ? { client_request_id: requestId } : {}) };
    const ok = await run((s) => s.insert(payTable, row as never), isRec ? 'Recebimento registrado.' : 'Pagamento registrado.');
    if (ok && remaining === 0 && !isRec) await nextOccurrence(account as Payable);
    return !!ok;
  }

  async function nextOccurrence(p: Payable) {
    const next = nextRecurrenceDate(p.due_date, p.recurrence);
    if (!next) return;
    const parent = p.recurrence_parent_id ?? p.id;
    await run(async (s) => {
      const all = await s.list('payables');
      if (all.some((r) => (r.recurrence_parent_id === parent || r.id === parent) && r.due_date === next)) return true;
      await s.insert('payables', {
        party_id: p.party_id, category_id: p.category_id, description: p.description, document_number: null,
        due_date: next, amount: p.amount, recurrence: p.recurrence, recurrence_parent_id: parent, notes: p.notes,
      });
      toast(`Próxima ocorrência gerada para ${fdate(next)}.`, 'info');
      return true;
    });
  }

  async function reverse(kind: FinKind, payment: Payment, reason: string): Promise<boolean> {
    const payTable = kind === 'receber' ? 'receivable_payments' : 'payable_payments';
    if (v2) {
      if (reason.trim().length < 5) { toast('Informe a justificativa do estorno (mínimo de 5 caracteres).', 'error'); return false; }
      return !!(await run((s) => s.update(payTable, payment.id, { reversal_reason: reason.trim() }), 'Estorno registrado. O valor voltou a ficar em aberto.'));
    }
    // banco sem a migração operacional: estorno antigo (exclusão, somente administrador)
    return !!(await run(async (s) => { await s.remove(payTable, payment.id); return true; }, 'Pagamento estornado.'));
  }

  return { pay, reverse, busy, canReverse, v2 };
}

/** Formulário de baixa total/parcial. Cada abertura gera um identificador único do envio. */
export function PaymentForm({ kind, account, existing, onDone }: { kind: FinKind; account: Account; existing: Payment[]; onDone?(): void }) {
  const ops = usePaymentOps();
  const open = openAmount(account);
  const [amountText, setAmountText] = useState(open.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const isRec = kind === 'receber';

  const submit = async () => {
    const amount = parseMoney(amountText);
    const ok = await ops.pay(kind, account, { paid_at: paidAt, amount: isNaN(amount) ? 0 : amount, method, notes: notes.trim() || null }, requestId, existing);
    if (ok) {
      setNotes('');
      setRequestId(newRequestId());
      onDone?.();
    }
  };

  return (
    <>
      <h4 className="form-section">{isRec ? 'Registrar recebimento (baixa)' : 'Registrar pagamento (baixa)'}</h4>
      <div className="form-grid">
        <Field label="Valor" hint={<>Em aberto: <b>{brl(open)}</b> — valor menor gera baixa parcial <button type="button" className="link-btn" onClick={() => setAmountText(open.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}>usar saldo total</button></>}>
          <MoneyInput value={amountText} onChange={setAmountText} aria-label="Valor da baixa" />
        </Field>
        <Field label="Data do pagamento"><input className="input" type="date" value={paidAt} max={today()} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Forma de pagamento"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Observação"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="row mt"><button className="btn success" type="button" disabled={ops.busy} onClick={submit}><Icon name="check" />{ops.busy ? 'Registrando…' : isRec ? 'Registrar recebimento' : 'Registrar pagamento'}</button></div>
    </>
  );
}

/** Histórico de pagamentos com estornos visíveis (nada é apagado). */
export function PaymentHistory({ kind, payments }: { kind: FinKind; payments: Payment[] }) {
  const ops = usePaymentOps();
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  return (
    <>
      <h4 className="form-section">Histórico de pagamentos</h4>
      {payments.length === 0 ? <p className="muted">Nenhum pagamento registrado.</p> : (
        <ul className="list bordered">
          {payments.map((p) => (
            <li key={p.id} className={p.reversed_at ? 'reversed' : ''}>
              <span className={`kpi-ico tone-${p.reversed_at ? 'muted' : 'success'}`}><Icon name={p.reversed_at ? 'undo' : 'check'} /></span>
              <div className="grow">
                <b className="amount-line">{brl(p.amount)}</b> · {p.method} {p.reversed_at && <Badge tone="danger">Estornado</Badge>}
                <div className="cell-sub">{fdate(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}{p.created_at ? ` · lançado em ${fdatetime(p.created_at)}` : ''}</div>
                {p.reversed_at && <div className="cell-sub">Estornado em {fdatetime(p.reversed_at)} — {p.reversal_reason}</div>}
              </div>
              {ops.canReverse && !p.reversed_at && <button className="btn xs" type="button" onClick={() => { setReason(''); setReversing(p); }}><Icon name="undo" />Estornar</button>}
            </li>
          ))}
        </ul>
      )}
      {reversing && (
        <Modal title="Estornar pagamento" onClose={() => setReversing(null)}
          onSubmit={async () => { if (await ops.reverse(kind, reversing, reason)) setReversing(null); }}
          footer={<><button className="btn" type="button" onClick={() => setReversing(null)}>Cancelar</button><button className="btn danger-solid" type="submit" disabled={ops.busy}>Confirmar estorno</button></>}>
          <p>O pagamento de <b>{brl(reversing.amount)}</b> em {fdate(reversing.paid_at)} ({reversing.method}) será estornado: o valor volta a ficar em aberto e o registro permanece no histórico.</p>
          {ops.v2
            ? <Field label="Justificativa *" hint="Obrigatória; fica registrada na auditoria"><textarea className="input" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            : <p className="hint">Banco ainda sem a atualização de estornos: o pagamento será removido (somente administrador).</p>}
        </Modal>
      )}
    </>
  );
}
