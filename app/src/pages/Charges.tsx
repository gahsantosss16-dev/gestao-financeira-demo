import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { PaymentForm, PaymentHistory } from '../components/finance';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { MoneyInput, TextInput } from '../components/TextInput';
import { Badge, Callout, Empty, ErrorBox, Field, Loading, PAGE_SIZE, PageHead, Pager, SchemaPending, SearchBox } from '../components/ui';
import { useMutation, useSchemaV2, useSchemaVersion, useTable } from '../data/DataContext';
import { formatDocument } from '../lib/documents';
import { CHARGE_STATUS_META, chargeStatus, openAmount, type ChargeStatus } from '../lib/finance';
import { brl, fdate, fdatetime, normalize, parseMoney, today } from '../lib/format';
import { formatIE } from '../lib/ie';
import { buildChargeStatement, downloadPdf } from '../lib/pdf';
import { can } from '../lib/permissions';
import type { Charge, Receivable } from '../lib/types';

const FILTERS: { key: '' | ChargeStatus | 'abertas'; label: string }[] = [
  { key: 'abertas', label: 'Em aberto' }, { key: 'vencida', label: 'Vencidas' }, { key: 'parcial', label: 'Parcialmente pagas' },
  { key: 'paga', label: 'Pagas' }, { key: 'cancelada', label: 'Canceladas' }, { key: '', label: 'Todas' },
];
const CHANNELS = ['E-mail', 'WhatsApp (envio manual)', 'Telefone', 'Presencial', 'Correspondência'];

export function Charges() {
  const schema = useSchemaVersion();
  const v2 = useSchemaV2();
  if (schema === null) return <Loading />;
  if (!v2) return <><PageHead title="Cobranças" subtitle="Cobranças internas vinculadas às contas a receber" /><SchemaPending feature="O módulo de Cobranças" /></>;
  return <ChargesV2 />;
}

function ChargesV2() {
  const { profile } = useAuth();
  const { confirm, toast } = useFeedback();
  const charges = useTable('charges');
  const receivables = useTable('receivables');
  const parties = useTable('parties');
  const regs = useTable('party_registrations');
  const payments = useTable('receivable_payments');
  const issuers = useTable('fiscal_issuer', can(profile?.role, 'read', 'fiscal_issuer'));
  const { run, busy } = useMutation();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>(params.get('busca') ? '' : 'abertas');
  const [q, setQ] = useState(params.get('busca') ?? '');
  const [partyFilter, setPartyFilter] = useState(params.get('cliente') ?? '');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState<{ receivable_id: string; amountText: string; due_date: string; description: string; notes: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const writable = can(profile?.role, 'write', 'charges');
  const t = today();

  const recById = useMemo(() => new Map(receivables.rows.map((r) => [r.id, r])), [receivables.rows]);
  const party = (id: string) => parties.rows.find((p) => p.id === id);
  const primaryIe = (partyId: string, regId?: string | null) => {
    const r = regs.rows.find((x) => x.id === regId) ?? regs.rows.find((x) => x.party_id === partyId && x.is_primary && x.active);
    return r ? `${r.uf} ${formatIE(r.uf, r.ie)}` : null;
  };
  const statusOf = (c: Charge) => chargeStatus(c, recById.get(c.receivable_id), t);

  const rows = useMemo(() => charges.rows
    .filter((c) => !filter || (filter === 'abertas' ? ['pendente', 'parcial', 'vencida'].includes(statusOf(c)) : statusOf(c) === filter))
    .filter((c) => !partyFilter || c.party_id === partyFilter)
    .filter((c) => !q || normalize([c.code, c.description, party(c.party_id)?.name, party(c.party_id)?.document, primaryIe(c.party_id)].join(' ')).includes(normalize(q)))
    .sort((a, b) => a.due_date.localeCompare(b.due_date)), [charges.rows, filter, partyFilter, q, receivables.rows, parties.rows, regs.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPage(0), [filter, partyFilter, q]);

  const activeByRec = new Set(charges.rows.filter((c) => !c.canceled_at).map((c) => c.receivable_id));
  const eligible = receivables.rows.filter((r) => !r.canceled_at && openAmount(r) > 0 && !activeByRec.has(r.id));

  const startCreate = (r?: Receivable) => setCreating({
    receivable_id: r?.id ?? '', amountText: r ? openAmount(r).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
    due_date: r?.due_date ?? t, description: r?.description ?? '', notes: '',
  });
  // vindo de Contas a receber: ?nova=<id da conta>
  const fromRec = params.get('nova');
  useEffect(() => {
    if (!fromRec || receivables.loading || charges.loading) return;
    params.delete('nova');
    setParams(params, { replace: true });
    const r = recById.get(fromRec);
    if (!r) return;
    if (activeByRec.has(r.id)) { toast('Esta conta já possui cobrança ativa.', 'info'); setQ(charges.rows.find((c) => c.receivable_id === r.id && !c.canceled_at)?.code ?? ''); return; }
    startCreate(r);
  }, [fromRec, receivables.loading, charges.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!creating) return;
    const r = recById.get(creating.receivable_id);
    if (!r) { toast('Selecione a conta a receber.', 'error'); return; }
    const amount = parseMoney(creating.amountText);
    if (isNaN(amount) || amount <= 0) { toast('Informe um valor maior que zero.', 'error'); return; }
    if (amount > r.amount) { toast(`O valor não pode ser maior que o da conta (${brl(r.amount)}).`, 'error'); return; }
    if (!(await confirm({ title: 'Gerar cobrança?', message: <>Cobrança de <b>{brl(amount)}</b> para <b>{party(r.party_id)?.name}</b>, vencimento {fdate(creating.due_date)}. Um código de identificação será gerado.</>, confirmLabel: 'Gerar cobrança' }))) return;
    const c = await run((s) => s.insert('charges', { receivable_id: r.id, party_id: r.party_id, amount, due_date: creating.due_date, description: creating.description.trim() || r.description, notes: creating.notes.trim() || null }), 'Cobrança gerada.');
    if (c) { setCreating(null); setDetailId(c.id); }
  };

  const detail = detailId ? charges.rows.find((c) => c.id === detailId) ?? null : null;

  const pdf = async (c: Charge) => {
    const r = recById.get(c.receivable_id);
    const p = party(c.party_id);
    const address = p ? [p.street, p.number, p.complement, p.district, p.city && `${p.city}/${p.uf ?? ''}`, p.cep].filter(Boolean).join(', ') : null;
    try {
      const doc = await buildChargeStatement({
        code: c.code, statusLabel: CHARGE_STATUS_META[statusOf(c)].label, description: c.description, dueDate: c.due_date, amount: c.amount,
        paid: r?.paid_amount ?? 0, open: r ? openAmount(r) : c.amount, notes: c.notes,
        client: { name: p?.name ?? '—', document: p?.document ?? null, ie: primaryIe(c.party_id, r?.registration_id), address, email: p?.email ?? null },
        payments: payments.rows.filter((x) => x.receivable_id === c.receivable_id && !x.reversed_at).map((x) => ({ paid_at: x.paid_at, amount: x.amount, method: x.method })),
        issuerCnpj: issuers.rows.find((i) => i.environment === 'homologacao')?.cnpj ?? null,
        generatedBy: profile?.full_name || profile?.email || undefined,
      });
      downloadPdf(doc, `${c.code}.pdf`);
    } catch (e) {
      toast(`Não foi possível gerar o PDF: ${(e as Error).message}`, 'error');
    }
  };

  const loading = charges.loading || receivables.loading;
  return (
    <>
      <PageHead title="Cobranças" subtitle="Cobranças internas vinculadas às contas a receber — identificação, situação, baixas e demonstrativo"
        actions={writable && <button className="btn primary" type="button" onClick={() => startCreate()} disabled={eligible.length === 0}><Icon name="plus" />Nova cobrança</button>} />
      {charges.error && <ErrorBox message={charges.error} />}
      <div className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Situação">
            {FILTERS.map((f) => <button key={f.key} type="button" className={`chip ${filter === f.key ? 'active' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
          </div>
        </div>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por código, cliente, CPF/CNPJ, IE ou descrição" />
          <select className="select" value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {parties.rows.filter((p) => charges.rows.some((c) => c.party_id === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {loading ? <Loading /> : rows.length === 0 ? <Empty icon="send">{charges.rows.length ? 'Nenhuma cobrança para os filtros selecionados.' : 'Nenhuma cobrança gerada. Gere a partir de uma conta a receber.'}</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Código</th><th>Cliente</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Em aberto</th><th>Situação</th></tr></thead>
              <tbody>
                {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c) => {
                  const r = recById.get(c.receivable_id);
                  const st = statusOf(c);
                  return (
                    <tr key={c.id} className="clickable" tabIndex={0} onClick={() => setDetailId(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(c.id); }}>
                      <td className="td-main" data-label="Código"><div className="cell-main mono">{c.code}</div><div className="cell-sub">{c.description}</div></td>
                      <td data-label="Cliente"><div>{party(c.party_id)?.name ?? '—'}</div><div className="cell-sub">{primaryIe(c.party_id, r?.registration_id) ?? formatDocument(party(c.party_id)?.document)}</div></td>
                      <td data-label="Vencimento" className="nowrap">{fdate(c.due_date)}</td>
                      <td data-label="Valor" className="num">{brl(c.amount)}</td>
                      <td data-label="Em aberto" className="num fw">{st === 'cancelada' ? '—' : brl(r ? openAmount(r) : c.amount)}</td>
                      <td data-label="Situação"><Badge tone={CHARGE_STATUS_META[st].tone}>{CHARGE_STATUS_META[st].label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={rows.length} onPage={setPage} label="cobrança(s)" />
      </div>

      {creating && (
        <Modal wide title="Nova cobrança" onClose={() => setCreating(null)} onSubmit={create}
          footer={<><button className="btn" type="button" onClick={() => setCreating(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>Gerar cobrança</button></>}>
          <div className="form-grid">
            <Field full label="Conta a receber *" hint="Somente contas em aberto e sem cobrança ativa (uma cobrança por obrigação)">
              <select className="select" autoFocus value={creating.receivable_id} onChange={(e) => {
                const r = recById.get(e.target.value);
                setCreating(r ? { ...creating, receivable_id: r.id, amountText: openAmount(r).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), due_date: r.due_date, description: r.description } : { ...creating, receivable_id: '' });
              }}>
                <option value="">Selecione…</option>
                {eligible.sort((a, b) => a.due_date.localeCompare(b.due_date)).map((r) => <option key={r.id} value={r.id}>{party(r.party_id)?.name} · {r.description} · venc. {fdate(r.due_date)} · em aberto {brl(openAmount(r))}</option>)}
              </select>
            </Field>
            <Field label="Valor *"><MoneyInput value={creating.amountText} onChange={(v) => setCreating({ ...creating, amountText: v })} aria-label="Valor da cobrança" /></Field>
            <Field label="Vencimento *"><input className="input" type="date" value={creating.due_date} onChange={(e) => setCreating({ ...creating, due_date: e.target.value })} /></Field>
            <Field full label="Descrição"><TextInput value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} /></Field>
            <Field full label="Observações"><textarea className="input" rows={2} value={creating.notes} onChange={(e) => setCreating({ ...creating, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {detail && (
        <ChargeDetail charge={detail} receivable={recById.get(detail.receivable_id)} status={statusOf(detail)} partyName={party(detail.party_id)?.name ?? '—'}
          ie={primaryIe(detail.party_id, recById.get(detail.receivable_id)?.registration_id)} writable={writable}
          payments={payments.rows.filter((p) => p.receivable_id === detail.receivable_id).sort((a, b) => b.paid_at.localeCompare(a.paid_at))}
          onClose={() => setDetailId(null)} onPdf={() => pdf(detail)}
          onSaveNotes={(notes) => run((s) => s.update('charges', detail.id, { notes: notes.trim() || null }), 'Observações salvas.')}
          onNotified={(channel) => run((s) => s.update('charges', detail.id, { notification_channel: channel, last_notified_at: new Date().toISOString() }), 'Contato registrado no histórico da cobrança.')}
          onCancel={async (reason) => {
            if (reason.trim().length < 5) { toast('Informe o motivo do cancelamento (mínimo de 5 caracteres).', 'error'); return; }
            if (await confirm({ title: 'Cancelar cobrança?', message: <>A cobrança <b>{detail.code}</b> será cancelada. A conta a receber e os pagamentos não são alterados. Uma nova cobrança poderá ser gerada depois.</>, confirmLabel: 'Cancelar cobrança', danger: true })) {
              await run((s) => s.update('charges', detail.id, { canceled_at: new Date().toISOString(), cancel_reason: reason.trim() }), 'Cobrança cancelada.');
            }
          }}
        />
      )}
    </>
  );
}

function ChargeDetail(props: {
  charge: Charge; receivable: Receivable | undefined; status: ChargeStatus; partyName: string; ie: string | null; writable: boolean;
  payments: { id: string; paid_at: string; amount: number; method: string; notes: string | null; reversed_at?: string | null; reversal_reason?: string | null; created_at?: string }[];
  onClose(): void; onPdf(): void; onSaveNotes(n: string): void; onNotified(channel: string): void; onCancel(reason: string): void;
}) {
  const { charge: c, receivable: r, status } = props;
  const [notes, setNotes] = useState(c.notes ?? '');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const open = status !== 'cancelada' && status !== 'paga';
  return (
    <Modal wide title={`Cobrança ${c.code}`} onClose={props.onClose}
      footer={<>
        {props.writable && !c.canceled_at && <button className="btn" type="button" onClick={() => setShowCancel(!showCancel)}>Cancelar cobrança</button>}
        <span className="spacer" />
        <button className="btn" type="button" onClick={props.onPdf}><Icon name="download" />Demonstrativo (PDF)</button>
        <button className="btn primary" type="button" onClick={props.onClose}>Fechar</button>
      </>}>
      <div className="row mb"><Badge tone={CHARGE_STATUS_META[status].tone}>{CHARGE_STATUS_META[status].label}</Badge>{c.canceled_at && <span className="muted">Cancelada em {fdatetime(c.canceled_at)} — {c.cancel_reason}</span>}</div>
      <dl className="kv">
        <dt>Cliente</dt><dd>{props.partyName}{props.ie ? ` · IE ${props.ie}` : ''}</dd>
        <dt>Descrição</dt><dd>{c.description}</dd>
        <dt>Vencimento</dt><dd>{fdate(c.due_date)}</dd>
        <dt>Valor da cobrança</dt><dd>{brl(c.amount)}</dd>
        <dt>Pago (conta)</dt><dd className="text-success">{brl(r?.paid_amount ?? 0)}</dd>
        <dt>Em aberto</dt><dd>{r ? brl(openAmount(r)) : '—'}</dd>
        <dt>Conta a receber</dt><dd>{r ? <Link to={`/receber?status=todos&cliente=${c.party_id}`}>{r.description}</Link> : '—'}</dd>
        {c.last_notified_at && <><dt>Último contato</dt><dd>{fdatetime(c.last_notified_at)} · {c.notification_channel}</dd></>}
      </dl>
      {showCancel && (
        <div className="preview-box mt">
          <Field label="Motivo do cancelamento *"><TextInput value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
          <div className="row mt"><button className="btn danger-solid sm" type="button" onClick={() => props.onCancel(cancelReason)}>Confirmar cancelamento</button></div>
        </div>
      )}
      {props.writable && open && r && <PaymentForm key={r.id + r.paid_amount} kind="receber" account={r} existing={props.payments} />}
      <PaymentHistory kind="receber" payments={props.payments} />
      <h4 className="form-section">Observações</h4>
      <textarea className="input" rows={2} value={notes} disabled={!props.writable} onChange={(e) => setNotes(e.target.value)} aria-label="Observações da cobrança" />
      {props.writable && notes !== (c.notes ?? '') && <div className="row mt-sm"><button className="btn sm" type="button" onClick={() => props.onSaveNotes(notes)}>Salvar observações</button></div>}
      {props.writable && !c.canceled_at && (
        <>
          <h4 className="form-section">Registrar contato com o cliente</h4>
          <Callout tone="info" icon="info">Envio automático (e-mail/WhatsApp) ainda não está integrado. Registre aqui os contatos feitos manualmente — o histórico prepara as notificações futuras.</Callout>
          <div className="row mt-sm">
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal do contato">{CHANNELS.map((ch) => <option key={ch}>{ch}</option>)}</select>
            <button className="btn sm" type="button" onClick={() => props.onNotified(channel)}><Icon name="send" />Registrar contato</button>
          </div>
        </>
      )}
    </Modal>
  );
}
