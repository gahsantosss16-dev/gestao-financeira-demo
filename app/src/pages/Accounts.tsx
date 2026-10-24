import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Badge, Callout, Empty, ErrorBox, Field, Loading, PAGE_SIZE, PageHead, Pager, SearchBox, StatusBadge } from '../components/ui';
import { useMutation, useTable } from '../data/DataContext';
import { checkAttachment } from '../data/source';
import { formatDocument } from '../lib/documents';
import { accountStatus, nextRecurrenceDate, openAmount, PAYMENT_METHODS, validatePayment, type AccountStatus } from '../lib/finance';
import { addMonths, brl, diffDays, fdate, fdatetime, normalize, parseMoney, round2, today } from '../lib/format';
import { can } from '../lib/permissions';
import type { Attachment, Payable, Receivable, Recurrence } from '../lib/types';

type Kind = 'receber' | 'pagar';
type Account = Receivable | Payable;
type Payment = { id: string; paid_at: string; amount: number; method: string; notes: string | null; created_at?: string };

const RECURRENCE_LABEL: Record<Recurrence, string> = { nenhuma: 'Não se repete', mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };

const STATUS_FILTERS: { key: string; label: string; match: (s: AccountStatus) => boolean; kinds?: Kind[] }[] = [
  { key: 'aberto', label: 'Em aberto', match: (s) => !['pago', 'cancelado'].includes(s) },
  { key: 'vencido', label: 'Vencidos', match: (s) => s === 'vencido' || s === 'inadimplente' },
  { key: 'inadimplente', label: 'Inadimplentes', match: (s) => s === 'inadimplente', kinds: ['receber'] },
  { key: 'pago', label: 'Pagos', match: (s) => s === 'pago' },
  { key: 'cancelado', label: 'Cancelados', match: (s) => s === 'cancelado' },
  { key: 'todos', label: 'Todos', match: () => true },
];

interface Draft {
  id?: string;
  party_id: string;
  category_id: string;
  service_id: string;
  description: string;
  document_number: string;
  issue_date: string;
  due_date: string;
  amountText: string;
  installments: number;
  recurrence: Recurrence;
  notes: string;
}

export function Accounts({ kind }: { kind: Kind }) {
  const isRec = kind === 'receber';
  const table = isRec ? 'receivables' : 'payables';
  const payTable = isRec ? 'receivable_payments' : 'payable_payments';
  const t = today();
  const { profile } = useAuth();
  const { confirm, toast } = useFeedback();
  const accounts = useTable(table);
  const payments = useTable(payTable);
  const parties = useTable('parties');
  const categories = useTable('categories');
  const services = useTable('services', isRec);
  const nfse = useTable('nfse_documents', isRec);
  const attachments = useTable('attachments');
  const { run, busy, source } = useMutation();
  const writable = can(profile?.role, 'write', table);
  const canDelete = can(profile?.role, 'delete', table);

  const [params, setParams] = useSearchParams();
  const statusKey = params.get('status') ?? 'aberto';
  const [q, setQ] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const rows = accounts.rows as Account[];
  const payRows = payments.rows as unknown as (Payment & { receivable_id?: string; payable_id?: string })[];
  const fk = (p: (typeof payRows)[number]) => (isRec ? p.receivable_id : p.payable_id);
  const partyName = (id: string | null) => parties.rows.find((p) => p.id === id)?.name ?? (isRec ? '—' : 'Sem fornecedor');
  const catName = (id: string | null) => categories.rows.find((c) => c.id === id)?.name ?? '—';
  const statusOf = (a: Account) => accountStatus(a, t, { delinquency: isRec });

  const filterDef = STATUS_FILTERS.find((f) => f.key === statusKey) ?? STATUS_FILTERS[0];
  const filtered = useMemo(() => rows
    .filter((a) => filterDef.match(statusOf(a)))
    .filter((a) => !partyFilter || a.party_id === partyFilter)
    .filter((a) => (!from || a.due_date >= from) && (!to || a.due_date <= to))
    .filter((a) => !q || normalize([a.description, a.document_number, partyName(a.party_id), catName(a.category_id)].join(' ')).includes(normalize(q)))
    .sort((a, b) => a.due_date.localeCompare(b.due_date)),
  [rows, filterDef, partyFilter, from, to, q, parties.rows, categories.rows]);

  useEffect(() => setPage(0), [statusKey, q, partyFilter, from, to]);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.key, rows.filter((a) => f.match(statusOf(a))).length])), [rows]);
  const totals = filtered.reduce((acc, a) => ({ amount: acc.amount + a.amount, paid: acc.paid + a.paid_amount, open: acc.open + (a.canceled_at ? 0 : openAmount(a)) }), { amount: 0, paid: 0, open: 0 });

  const partyOptions = parties.rows
    .filter((p) => p.active && (isRec ? p.kind !== 'fornecedor' : p.kind !== 'cliente'))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const catOptions = categories.rows.filter((c) => c.active && c.type === (isRec ? 'receita' : 'despesa'));

  const openNew = () => {
    setErrors({});
    setDraft({ party_id: '', category_id: '', service_id: '', description: '', document_number: '', issue_date: t, due_date: t, amountText: '', installments: 1, recurrence: 'nenhuma', notes: '' });
  };
  const openEdit = (a: Account) => {
    setErrors({});
    setDetailId(null);
    setDraft({
      id: a.id, party_id: a.party_id ?? '', category_id: a.category_id ?? '', service_id: (a as Receivable).service_id ?? '',
      description: a.description, document_number: a.document_number ?? '', issue_date: (a as Receivable).issue_date ?? t,
      due_date: a.due_date, amountText: a.amount.toFixed(2).replace('.', ','), installments: 1,
      recurrence: (a as Payable).recurrence ?? 'nenhuma', notes: a.notes ?? '',
    });
  };

  const save = async () => {
    if (!draft) return;
    const errs: Record<string, string> = {};
    const amount = parseMoney(draft.amountText);
    if (isRec && !draft.party_id) errs.party_id = 'Selecione o cliente.';
    if (!draft.description.trim()) errs.description = 'Informe a descrição.';
    if (!draft.due_date) errs.due_date = 'Informe o vencimento.';
    if (isNaN(amount) || amount <= 0) errs.amount = 'Informe um valor maior que zero.';
    const current = draft.id ? rows.find((r) => r.id === draft.id) : null;
    if (current && amount < current.paid_amount) errs.amount = `O valor não pode ser menor que o já pago (${brl(current.paid_amount)}).`;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const base = {
      party_id: draft.party_id || null, category_id: draft.category_id || null, description: draft.description.trim(),
      document_number: draft.document_number.trim() || null, notes: draft.notes.trim() || null,
      ...(isRec ? { service_id: draft.service_id || null, issue_date: draft.issue_date } : { recurrence: draft.recurrence }),
    };
    if (draft.id) {
      const ok = await run((s) => s.update(table, draft.id!, { ...base, due_date: draft.due_date, amount } as never), 'Lançamento atualizado.');
      if (ok) setDraft(null);
      return;
    }
    const n = isRec ? Math.max(1, Math.min(24, draft.installments)) : 1;
    const parcel = Math.floor((amount / n) * 100) / 100;
    if (n > 1 && !(await confirm({ title: `Criar ${n} parcelas?`, message: <>Serão lançadas {n} parcelas mensais de aproximadamente <b>{brl(parcel)}</b>, totalizando <b>{brl(amount)}</b>, a partir de {fdate(draft.due_date)}.</>, confirmLabel: 'Criar parcelas' }))) return;
    const ok = await run(async (s) => {
      for (let i = 0; i < n; i++) {
        const value = i === n - 1 ? round2(amount - parcel * (n - 1)) : parcel;
        await s.insert(table, {
          ...base, description: n > 1 ? `${base.description} (${i + 1}/${n})` : base.description,
          due_date: addMonths(draft.due_date, i), amount: value,
        } as never);
      }
      return true;
    }, n > 1 ? `${n} parcelas lançadas.` : 'Lançamento criado.');
    if (ok) setDraft(null);
  };

  const detail = detailId ? rows.find((r) => r.id === detailId) ?? null : null;

  return (
    <>
      <PageHead
        title={isRec ? 'Contas a receber' : 'Contas a pagar'}
        subtitle={isRec ? 'Receitas, vencimentos, recebimentos parciais e inadimplência' : 'Despesas, contas recorrentes, pagamentos e comprovantes'}
        actions={writable && <button className="btn primary" type="button" onClick={openNew}><Icon name="plus" />{isRec ? 'Nova receita' : 'Nova despesa'}</button>}
      />
      {accounts.error && <ErrorBox message={accounts.error} />}
      <div className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Situação">
            {STATUS_FILTERS.filter((f) => !f.kinds || f.kinds.includes(kind)).map((f) => (
              <button key={f.key} type="button" className={`chip ${statusKey === f.key ? 'active' : ''}`}
                onClick={() => { params.set('status', f.key); setParams(params, { replace: true }); }}>
                {f.label}<span className="count">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar descrição, documento, categoria ou nome" />
          <select className="select" value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} aria-label={isRec ? 'Cliente' : 'Fornecedor'}>
            <option value="">{isRec ? 'Todos os clientes' : 'Todos os fornecedores'}</option>
            {partyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="inline-field">Vencimento de<input className="input date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline-field">até<input className="input date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {(q || partyFilter || from || to) && <button className="btn ghost sm" type="button" onClick={() => { setQ(''); setPartyFilter(''); setFrom(''); setTo(''); }}>Limpar filtros</button>}
        </div>
        {accounts.loading ? <Loading /> : filtered.length === 0 ? <Empty>Nenhum lançamento encontrado para os filtros selecionados.</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Descrição</th><th>{isRec ? 'Cliente' : 'Fornecedor'}</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Em aberto</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {pageRows.map((a) => {
                  const st = statusOf(a);
                  const late = diffDays(t, a.due_date);
                  return (
                    <tr key={a.id} className="clickable" onClick={() => setDetailId(a.id)}>
                      <td className="td-main" data-label="Descrição">
                        <div className="cell-main">{a.description}</div>
                        <div className="cell-sub">{catName(a.category_id)}{!isRec && (a as Payable).recurrence !== 'nenhuma' && <> · <Icon name="repeat" className="inline-ico" /> {RECURRENCE_LABEL[(a as Payable).recurrence]}</>}</div>
                      </td>
                      <td data-label={isRec ? 'Cliente' : 'Fornecedor'}>{partyName(a.party_id)}</td>
                      <td data-label="Vencimento" className="nowrap">{fdate(a.due_date)}{late > 0 && !['pago', 'cancelado'].includes(st) && <div className="cell-sub text-danger">{late} dia(s) em atraso</div>}</td>
                      <td data-label="Valor" className="num">{brl(a.amount)}</td>
                      <td data-label="Em aberto" className="num fw">{a.canceled_at ? '—' : brl(openAmount(a))}</td>
                      <td data-label="Situação"><StatusBadge status={st} /></td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        {writable && !['pago', 'cancelado'].includes(st) && <button className="btn xs success" type="button" onClick={() => setDetailId(a.id)}><Icon name="money" />{isRec ? 'Receber' : 'Pagar'}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={filtered.length} onPage={setPage} label="lançamento(s)" />
        <div className="pager totals">
          <span>Total <b>{brl(totals.amount)}</b> · {isRec ? 'Recebido' : 'Pago'} <b className="text-success">{brl(totals.paid)}</b> · Em aberto <b>{brl(totals.open)}</b></span>
        </div>
      </div>

      {draft && (
        <Modal wide title={draft.id ? 'Editar lançamento' : isRec ? 'Nova conta a receber' : 'Nova conta a pagar'} onClose={() => setDraft(null)} onSubmit={save}
          footer={<><button className="btn" type="button" onClick={() => setDraft(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
          <div className="form-grid">
            <Field label={isRec ? 'Cliente *' : 'Fornecedor'} error={errors.party_id} hint={partyOptions.length === 0 ? <Link to="/cadastros/pessoas">Cadastre primeiro em Clientes e fornecedores</Link> : undefined}>
              <select className="select" value={draft.party_id} onChange={(e) => setDraft({ ...draft, party_id: e.target.value })} autoFocus>
                <option value="">{isRec ? 'Selecione…' : 'Sem fornecedor'}</option>
                {partyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.document ? ` · ${formatDocument(p.document)}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Categoria">
              <select className="select" value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
                <option value="">—</option>{catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {isRec && (
              <Field label="Serviço prestado" hint="Necessário para emitir NFS-e deste lançamento">
                <select className="select" value={draft.service_id} onChange={(e) => {
                  const srv = services.rows.find((s) => s.id === e.target.value);
                  setDraft({
                    ...draft, service_id: e.target.value,
                    description: draft.description || srv?.name || '',
                    amountText: draft.amountText || (srv?.default_amount ? String(srv.default_amount).replace('.', ',') : ''),
                    category_id: draft.category_id || srv?.category_id || '',
                  });
                }}>
                  <option value="">Nenhum</option>{services.rows.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field full label="Descrição *" error={errors.description}><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <Field label={draft.installments > 1 ? 'Valor total (R$) *' : 'Valor (R$) *'} error={errors.amount}><input className="input" inputMode="decimal" placeholder="0,00" value={draft.amountText} onChange={(e) => setDraft({ ...draft, amountText: e.target.value })} /></Field>
            <Field label={draft.installments > 1 ? '1º vencimento *' : 'Vencimento *'} error={errors.due_date}><input className="input" type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></Field>
            {isRec && <Field label="Data de emissão"><input className="input" type="date" value={draft.issue_date} onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })} /></Field>}
            {isRec && !draft.id && (
              <Field label="Parcelas" hint="Parcelas mensais">
                <select className="select" value={draft.installments} onChange={(e) => setDraft({ ...draft, installments: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista (1x)' : `${n}x`}</option>)}
                </select>
              </Field>
            )}
            {!isRec && (
              <Field label="Recorrência" hint="Ao quitar, a próxima ocorrência é gerada automaticamente">
                <select className="select" value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as Recurrence })}>
                  {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            )}
            <Field label="Nº do documento" hint="Boleto, fatura, contrato…"><input className="input" value={draft.document_number} onChange={(e) => setDraft({ ...draft, document_number: e.target.value })} /></Field>
            <Field full label="Observações"><textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {detail && (
        <AccountDetail
          kind={kind} account={detail} status={statusOf(detail)} partyName={partyName(detail.party_id)} categoryName={catName(detail.category_id)}
          payments={payRows.filter((p) => fk(p) === detail.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at))}
          attachments={(attachments.rows as Attachment[]).filter((a) => a.entity_id === detail.id)}
          nfseCount={isRec ? nfse.rows.filter((n) => n.receivable_id === detail.id).length : 0}
          writable={writable} canDelete={canDelete} busy={busy}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detail)}
          onPay={async (p) => {
            const problem = validatePayment(detail, p.amount);
            if (problem) { toast(problem, 'error'); return false; }
            const remaining = round2(openAmount(detail) - p.amount);
            if (!(await confirm({
              title: isRec ? 'Confirmar recebimento' : 'Confirmar pagamento',
              message: <>Registrar <b>{brl(p.amount)}</b> em {fdate(p.paid_at)} via {p.method}.<br />{remaining > 0 ? <>Restará <b>{brl(remaining)}</b> em aberto (pagamento parcial).</> : 'A conta ficará quitada.'}</>,
              confirmLabel: 'Registrar',
            }))) return false;
            const ok = await run((s) => s.insert(payTable, { [isRec ? 'receivable_id' : 'payable_id']: detail.id, ...p } as never), isRec ? 'Recebimento registrado.' : 'Pagamento registrado.');
            if (ok && remaining === 0 && !isRec) {
              const pay = detail as Payable;
              const next = nextRecurrenceDate(pay.due_date, pay.recurrence);
              const parent = pay.recurrence_parent_id ?? pay.id;
              const exists = (rows as Payable[]).some((r) => (r.recurrence_parent_id === parent || r.id === parent) && r.due_date === next);
              if (next && !exists) {
                await run((s) => s.insert('payables', {
                  party_id: pay.party_id, category_id: pay.category_id, description: pay.description, document_number: null,
                  due_date: next, amount: pay.amount, recurrence: pay.recurrence, recurrence_parent_id: parent, notes: pay.notes,
                }), `Próxima ocorrência gerada para ${fdate(next)}.`);
              }
            }
            return !!ok;
          }}
          onReverse={async (p) => {
            if (await confirm({ title: 'Estornar pagamento?', message: <>O pagamento de <b>{brl(p.amount)}</b> em {fdate(p.paid_at)} será removido e o saldo voltará a ficar em aberto. A operação fica registrada na auditoria.</>, confirmLabel: 'Estornar', danger: true })) {
              await run(async (s) => { await s.remove(payTable, p.id); return true; }, 'Pagamento estornado.');
            }
          }}
          onCancel={async (reason) => {
            if (await confirm({ title: 'Cancelar lançamento?', message: <>“{detail.description}” deixará de compor os saldos. O histórico é mantido.</>, confirmLabel: 'Cancelar lançamento', danger: true })) {
              const ok = await run((s) => s.update(table, detail.id, { canceled_at: new Date().toISOString(), cancel_reason: reason || null } as never), 'Lançamento cancelado.');
              if (ok) setDetailId(null);
            }
          }}
          onDelete={async () => {
            if (await confirm({ title: 'Excluir definitivamente?', message: 'O lançamento e seus pagamentos serão excluídos. Prefira “Cancelar” para manter o histórico.', confirmLabel: 'Excluir', danger: true })) {
              const ok = await run(async (s) => { await s.remove(table, detail.id); return true; }, 'Lançamento excluído.');
              if (ok) setDetailId(null);
            }
          }}
          onUpload={async (file) => {
            const problem = checkAttachment(file);
            if (problem) { toast(problem, 'error'); return; }
            await run((s) => s.uploadAttachment(isRec ? 'receivable' : 'payable', detail.id, file), 'Comprovante anexado.');
          }}
          onOpenAttachment={async (att) => {
            try { window.open(await source.attachmentUrl(att), '_blank', 'noopener'); }
            catch (e) { toast((e as Error).message, 'error'); }
          }}
        />
      )}
    </>
  );
}

interface DetailProps {
  kind: Kind;
  account: Account;
  status: AccountStatus;
  partyName: string;
  categoryName: string;
  payments: Payment[];
  attachments: Attachment[];
  nfseCount: number;
  writable: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose(): void;
  onEdit(): void;
  onPay(p: { paid_at: string; amount: number; method: string; notes: string | null }): Promise<boolean>;
  onReverse(p: Payment): void;
  onCancel(reason: string): void;
  onDelete(): void;
  onUpload(file: File): void;
  onOpenAttachment(a: Attachment): void;
}

function AccountDetail(props: DetailProps) {
  const { kind, account: a, status, payments, attachments, writable, canDelete, busy } = props;
  const isRec = kind === 'receber';
  const open = openAmount(a);
  const [amountText, setAmountText] = useState(open.toFixed(2).replace('.', ','));
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const closed = status === 'pago' || status === 'cancelado';

  const pay = async () => {
    const amount = parseMoney(amountText);
    const ok = await props.onPay({ paid_at: paidAt, amount: isNaN(amount) ? 0 : amount, method, notes: notes.trim() || null });
    if (ok) { setNotes(''); }
  };

  return (
    <Modal wide title={a.description} onClose={props.onClose}
      footer={<>
        {canDelete && <button className="btn danger" type="button" onClick={props.onDelete}><Icon name="trash" />Excluir</button>}
        {writable && !a.canceled_at && <button className="btn" type="button" onClick={() => setShowCancel(!showCancel)}>Cancelar lançamento</button>}
        <span className="spacer" />
        {writable && !a.canceled_at && <button className="btn" type="button" onClick={props.onEdit}><Icon name="edit" />Editar</button>}
        <button className="btn primary" type="button" onClick={props.onClose}>Fechar</button>
      </>}>
      <div className="row mb"><StatusBadge status={status} />{a.canceled_at && a.cancel_reason && <span className="muted">Motivo: {a.cancel_reason}</span>}</div>
      <dl className="kv">
        <dt>{isRec ? 'Cliente' : 'Fornecedor'}</dt><dd>{props.partyName}</dd>
        <dt>Categoria</dt><dd>{props.categoryName}</dd>
        <dt>Vencimento</dt><dd>{fdate(a.due_date)}</dd>
        <dt>Valor</dt><dd>{brl(a.amount)}</dd>
        <dt>{isRec ? 'Recebido' : 'Pago'}</dt><dd className="text-success">{brl(a.paid_amount)}</dd>
        <dt>Em aberto</dt><dd>{a.canceled_at ? '—' : brl(open)}</dd>
        {a.document_number && <><dt>Documento</dt><dd>{a.document_number}</dd></>}
        {!isRec && (a as Payable).recurrence !== 'nenhuma' && <><dt>Recorrência</dt><dd>{RECURRENCE_LABEL[(a as Payable).recurrence]}</dd></>}
        {a.notes && <><dt>Observações</dt><dd>{a.notes}</dd></>}
      </dl>

      {showCancel && (
        <div className="preview-box mt">
          <Field label="Motivo do cancelamento"><input className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
          <div className="row mt"><button className="btn danger-solid sm" type="button" onClick={() => props.onCancel(cancelReason)}>Confirmar cancelamento</button></div>
        </div>
      )}

      {writable && !closed && (
        <>
          <h4 className="form-section">{isRec ? 'Registrar recebimento' : 'Registrar pagamento'}</h4>
          <div className="form-grid">
            <Field label="Valor (R$)" hint={`Em aberto: ${brl(open)} — informe um valor menor para pagamento parcial`}><input className="input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} /></Field>
            <Field label="Data"><input className="input" type="date" value={paidAt} max={today()} onChange={(e) => setPaidAt(e.target.value)} /></Field>
            <Field label="Forma de pagamento"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Observação"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <div className="row mt"><button className="btn success" type="button" disabled={busy} onClick={pay}><Icon name="check" />{isRec ? 'Registrar recebimento' : 'Registrar pagamento'}</button></div>
        </>
      )}

      <h4 className="form-section">Histórico de pagamentos</h4>
      {payments.length === 0 ? <p className="muted">Nenhum pagamento registrado.</p> : (
        <ul className="list bordered">
          {payments.map((p) => (
            <li key={p.id}>
              <span className="kpi-ico tone-success"><Icon name="check" /></span>
              <div className="grow"><b>{brl(p.amount)}</b> · {p.method}<div className="cell-sub">{fdate(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}{p.created_at ? ` · lançado em ${fdatetime(p.created_at)}` : ''}</div></div>
              {canDelete && <button className="btn xs" type="button" onClick={() => props.onReverse(p)}><Icon name="undo" />Estornar</button>}
            </li>
          ))}
        </ul>
      )}

      <h4 className="form-section">Comprovantes e anexos</h4>
      {attachments.length === 0 ? <p className="muted">Nenhum arquivo anexado.</p> : (
        <ul className="list bordered">
          {attachments.map((f) => (
            <li key={f.id}>
              <span className="kpi-ico tone-info"><Icon name="paperclip" /></span>
              <div className="grow truncate">{f.file_name}<div className="cell-sub">{f.size_bytes ? `${Math.ceil(f.size_bytes / 1024)} KB` : ''}</div></div>
              <button className="btn xs" type="button" onClick={() => props.onOpenAttachment(f)}><Icon name="download" />Abrir</button>
            </li>
          ))}
        </ul>
      )}
      {writable && (
        <label className="btn sm mt upload-btn">
          <Icon name="paperclip" />Anexar arquivo (PDF ou imagem, até 10 MB)
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onUpload(f); e.target.value = ''; }} />
        </label>
      )}

      {isRec && (
        <>
          <h4 className="form-section">Nota fiscal</h4>
          {props.nfseCount > 0
            ? <p><Badge tone="info">{props.nfseCount} documento(s) fiscal(is) vinculado(s)</Badge> <Link to={`/fiscal/notas?lancamento=${a.id}`}>Ver no módulo fiscal</Link></p>
            : <Callout tone="info" icon="file">Nenhuma NFS-e vinculada. <Link to={`/fiscal/notas?lancamento=${a.id}`}>Preparar NFS-e deste lançamento</Link></Callout>}
        </>
      )}
    </Modal>
  );
}
