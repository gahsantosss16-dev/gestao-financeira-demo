import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Badge, Callout, Empty, ErrorBox, Field, Loading, PageHead } from '../components/ui';
import { useMutation, useTable } from '../data/DataContext';
import { formatDocument, isValidCNPJ, onlyDigits } from '../lib/documents';
import { brl, fdate, fdatetime, parseMoney, today } from '../lib/format';
import { can } from '../lib/permissions';
import type { FiscalIssuer, NfseDocument, NfseStatus } from '../lib/types';
import { NFSE_BASE_URL } from '../../../supabase/functions/_shared/nfseEndpoints';
import { hasBlockingIssues, validateDpsDraft, type DpsIssue } from '../../../supabase/functions/_shared/dpsValidation';

const NFSE_STATUS: Record<NfseStatus, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  validada: { label: 'Pré-validada', tone: 'info' },
  enviada: { label: 'Enviada', tone: 'primary' },
  autorizada: { label: 'Autorizada', tone: 'success' },
  rejeitada: { label: 'Rejeitada', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'muted' },
};
const OPERATION_LABEL = { emitir: 'Emissão', evento: 'Evento', consultar_nfse: 'Consulta NFS-e', consultar_dps: 'Consulta DPS' };

interface Draft { id?: string; receivable_id: string; party_id: string; service_id: string; amountText: string; description: string; competence_date: string }

export function FiscalNotes() {
  const { profile } = useAuth();
  const { confirm, toast } = useFeedback();
  const docs = useTable('nfse_documents');
  const parties = useTable('parties');
  const services = useTable('services');
  const receivables = useTable('receivables');
  const canSeeIssuer = can(profile?.role, 'read', 'fiscal_issuer');
  const issuers = useTable('fiscal_issuer', canSeeIssuer);
  const canSeeRequests = can(profile?.role, 'read', 'nfse_requests');
  const requests = useTable('nfse_requests', canSeeRequests);
  const { run, busy } = useMutation();
  const writable = can(profile?.role, 'write', 'nfse_documents');
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState<{ type: 'consultar_nfse' | 'consultar_dps'; value: string } | null>(null);
  const t = today();

  const issuer = issuers.rows.find((i) => i.environment === 'homologacao') ?? null;
  const party = (id: string) => parties.rows.find((p) => p.id === id) ?? null;
  const service = (id: string) => services.rows.find((s) => s.id === id) ?? null;

  const issuesFor = (d: { amount: number; competence_date: string; description: string; party_id: string; service_id: string }): DpsIssue[] =>
    validateDpsDraft(d, canSeeIssuer ? issuer : null, service(d.service_id), party(d.party_id), t);

  // abre rascunho a partir de um lançamento (?lancamento=ID)
  const fromReceivable = params.get('lancamento');
  useEffect(() => {
    if (!fromReceivable || !writable || receivables.loading) return;
    const r = receivables.rows.find((x) => x.id === fromReceivable);
    params.delete('lancamento');
    setParams(params, { replace: true });
    if (!r) return;
    const existing = docs.rows.find((d) => d.receivable_id === r.id && d.status !== 'cancelada');
    if (existing) { toast('Este lançamento já possui documento fiscal vinculado.', 'info'); return; }
    const srv = r.service_id ? service(r.service_id) : null;
    setDraft({ receivable_id: r.id, party_id: r.party_id, service_id: r.service_id ?? '', amountText: String(r.amount).replace('.', ','), description: srv?.description || r.description, competence_date: r.issue_date || t });
  }, [fromReceivable, receivables.loading, writable]);

  const readiness = useMemo(() => {
    const validated = services.rows.filter((s) => s.active && s.tax_validated).length;
    return [
      { ok: !!(issuer?.cnpj && issuer.legal_name && issuer.municipal_registration && issuer.city_ibge_code), label: 'Dados fiscais da ASSOCIAPEC', link: '/fiscal/configuracao' },
      { ok: !!issuer && issuer.certificate_type !== 'a_confirmar' && !!issuer.certificate_valid_until && issuer.certificate_valid_until >= t, label: 'Certificado digital confirmado (tipo e validade)', link: '/fiscal/configuracao' },
      { ok: validated > 0, label: `Serviços com cTribMun validado pela contabilidade (${validated})`, link: '/cadastros/servicos' },
      { ok: false, label: 'Geração do XML, validação XSD e assinatura da DPS (Etapa 3)' },
      { ok: false, label: 'Integração habilitada para homologação no backend' },
    ];
  }, [issuer, services.rows, t]);

  const saveDraft = async () => {
    if (!draft) return;
    const amount = parseMoney(draft.amountText);
    if (!draft.party_id || !draft.service_id || isNaN(amount) || amount <= 0 || !draft.description.trim()) {
      toast('Preencha tomador, serviço, valor e descrição.', 'error');
      return;
    }
    const srv = service(draft.service_id)!;
    const payload = {
      receivable_id: draft.receivable_id || null, party_id: draft.party_id, service_id: draft.service_id, amount,
      description: draft.description.trim(), competence_date: draft.competence_date,
      // o código é copiado do serviço no momento do rascunho; se não houver, fica marcado como pendente
      c_trib_mun: srv.c_trib_mun || 'PENDENTE', status: 'rascunho' as const, environment: 'homologacao' as const,
    };
    const ok = await run((s) => (draft.id ? s.update('nfse_documents', draft.id, payload) : s.insert('nfse_documents', payload)), 'Rascunho de DPS salvo.');
    if (ok) setDraft(null);
  };

  const prevalidate = async (d: NfseDocument) => {
    const issues = issuesFor(d);
    if (hasBlockingIssues(issues)) { toast('Corrija as pendências antes de pré-validar.', 'error'); return; }
    const srv = service(d.service_id)!;
    await run((s) => s.update('nfse_documents', d.id, { status: 'validada', c_trib_mun: srv.c_trib_mun! }), 'DPS pré-validada.');
  };

  const send = async (d: NfseDocument) => {
    if (!(await confirm({ title: 'Enviar DPS para homologação?', message: <>A solicitação será encaminhada ao backend fiscal (ambiente de <b>homologação</b>). Nenhuma nota é emitida em produção.</>, confirmLabel: 'Enviar' }))) return;
    const res = await run((s) => s.callFiscal('emitir', { environment: 'homologacao', documentId: d.id }));
    if (res) toast(res.message ?? res.status, res.status === 'ok' ? 'ok' : 'info');
  };

  const runQuery = async () => {
    if (!query?.value.trim()) return;
    const value = query.value.trim();
    const res = await run((s) => s.callFiscal(query.type, { environment: 'homologacao', ...(query.type === 'consultar_nfse' ? { chaveAcesso: value } : { dpsId: value }) }));
    if (res) { toast(res.message ?? res.status, res.status === 'ok' ? 'ok' : 'info'); setQuery(null); }
  };

  const openReceivables = receivables.rows.filter((r) => !r.canceled_at && !docs.rows.some((d) => d.receivable_id === r.id && d.id !== draft?.id));
  const draftIssues = draft ? issuesFor({ ...draft, amount: parseMoney(draft.amountText) || 0 }) : [];

  return (
    <>
      <PageHead title="Notas fiscais de serviço (NFS-e)" subtitle="Prefeitura de Campo Grande/MS · ambiente de homologação"
        actions={<>
          {writable && <button className="btn" type="button" onClick={() => setQuery({ type: 'consultar_nfse', value: '' })}><Icon name="search" />Consultar</button>}
          {writable && <button className="btn primary" type="button" onClick={() => setDraft({ receivable_id: '', party_id: '', service_id: '', amountText: '', description: '', competence_date: t })}><Icon name="plus" />Nova DPS (rascunho)</button>}
        </>} />

      <Callout tone="warning" icon="lock">
        <b>Integração fiscal em preparação.</b> Os rascunhos e a pré-validação já funcionam, mas o envio à prefeitura
        permanece <b>desabilitado</b> até a confirmação do certificado digital, a validação dos códigos tributários pela
        contabilidade e a conclusão da Etapa 3. Nenhuma nota real é emitida. Homologação: <code>{NFSE_BASE_URL.homologacao}</code>
      </Callout>

      <div className="grid g-2-1 mt">
        <div className="card">
          <div className="card-head"><h3>Documentos fiscais</h3><small>{docs.rows.length} registro(s)</small></div>
          {docs.error && <div className="card-pad"><ErrorBox message={docs.error} /></div>}
          {docs.loading ? <Loading /> : docs.rows.length === 0 ? <Empty icon="file">Nenhuma DPS criada. Crie um rascunho a partir de um lançamento de contas a receber.</Empty> : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Tomador / serviço</th><th>Competência</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {docs.rows.map((d) => {
                    const issues = d.status === 'rascunho' ? issuesFor(d) : [];
                    const blocking = issues.filter((i) => i.severity === 'bloqueante').length;
                    return (
                      <tr key={d.id}>
                        <td className="td-main" data-label="Tomador">
                          <div className="cell-main">{party(d.party_id)?.name ?? '—'}</div>
                          <div className="cell-sub">{service(d.service_id)?.name} · cTribMun {d.c_trib_mun}</div>
                          {d.receivable_id && <div className="cell-sub"><Link to="/receber?status=todos">Vinculada a conta a receber</Link></div>}
                        </td>
                        <td data-label="Competência">{fdate(d.competence_date)}</td>
                        <td data-label="Valor" className="num">{brl(d.amount)}</td>
                        <td data-label="Situação">
                          <Badge tone={NFSE_STATUS[d.status].tone}>{NFSE_STATUS[d.status].label}</Badge>
                          {blocking > 0 && <div className="cell-sub text-warning">{blocking} pendência(s)</div>}
                          {d.last_error && <div className="cell-sub text-danger">{d.last_error}</div>}
                        </td>
                        <td className="actions-cell">
                          {writable && d.status === 'rascunho' && <>
                            <button className="btn xs" type="button" onClick={() => setDraft({ id: d.id, receivable_id: d.receivable_id ?? '', party_id: d.party_id, service_id: d.service_id, amountText: String(d.amount).replace('.', ','), description: d.description, competence_date: d.competence_date })}><Icon name="edit" />Editar</button>
                            <button className="btn xs" type="button" disabled={busy || blocking > 0} title={blocking ? 'Há pendências' : ''} onClick={() => prevalidate(d)}><Icon name="check" />Pré-validar</button>
                            <button className="btn xs danger" type="button" onClick={async () => {
                              if (await confirm({ title: 'Excluir rascunho?', message: 'O rascunho da DPS será excluído.', danger: true, confirmLabel: 'Excluir' }))
                                await run(async (s) => { await s.remove('nfse_documents', d.id); return true; }, 'Rascunho excluído.');
                            }}><Icon name="trash" /></button>
                          </>}
                          {writable && d.status === 'validada' && <button className="btn xs primary" type="button" disabled={busy} onClick={() => send(d)}><Icon name="send" />Enviar (homologação)</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Prontidão para emissão</h3></div>
          <ul className="list">
            {readiness.map((r) => (
              <li key={r.label}>
                <span className={`kpi-ico tone-${r.ok ? 'success' : 'warning'}`}><Icon name={r.ok ? 'check' : 'clock'} /></span>
                <div className="grow">{r.label}</div>
                {!r.ok && r.link && <Link className="btn xs" to={r.link}>Resolver</Link>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {canSeeRequests && (
        <div className="card mt">
          <div className="card-head"><h3>Histórico de solicitações ao backend fiscal</h3><small>respostas e erros ficam registrados</small></div>
          {requests.rows.length === 0 ? <Empty icon="history">Nenhuma solicitação registrada.</Empty> : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Data</th><th>Operação</th><th>Ambiente</th><th>Endpoint</th><th>Resultado</th></tr></thead>
                <tbody>
                  {requests.rows.slice(0, 50).map((r) => (
                    <tr key={r.id}>
                      <td data-label="Data" className="nowrap">{fdatetime(r.created_at)}</td>
                      <td data-label="Operação">{OPERATION_LABEL[r.operation]}</td>
                      <td data-label="Ambiente"><Badge tone={r.environment === 'producao' ? 'danger' : 'info'}>{r.environment === 'producao' ? 'Produção' : 'Homologação'}</Badge></td>
                      <td data-label="Endpoint" className="mono small">{r.http_method} {r.url.replace(/^https?:\/\/[^/]+/, '')}</td>
                      <td data-label="Resultado">{r.http_status ? `HTTP ${r.http_status}` : ''}{r.error && <div className="cell-sub">{r.error}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {draft && (
        <Modal wide title={draft.id ? 'Editar rascunho de DPS' : 'Nova DPS (rascunho)'} onClose={() => setDraft(null)} onSubmit={saveDraft}
          footer={<><button className="btn" type="button" onClick={() => setDraft(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>Salvar rascunho</button></>}>
          <div className="form-grid">
            <Field full label="Lançamento de contas a receber" hint="Vincula a nota ao financeiro e evita digitar os dados novamente">
              <select className="select" value={draft.receivable_id} onChange={(e) => {
                const r = receivables.rows.find((x) => x.id === e.target.value);
                if (!r) { setDraft({ ...draft, receivable_id: '' }); return; }
                const srv = r.service_id ? service(r.service_id) : null;
                setDraft({ ...draft, receivable_id: r.id, party_id: r.party_id, service_id: r.service_id ?? draft.service_id, amountText: String(r.amount).replace('.', ','), description: srv?.description || r.description, competence_date: r.issue_date || draft.competence_date });
              }}>
                <option value="">Sem vínculo</option>
                {openReceivables.map((r) => <option key={r.id} value={r.id}>{fdate(r.due_date)} · {party(r.party_id)?.name} · {r.description} · {brl(r.amount)}</option>)}
              </select>
            </Field>
            <Field label="Tomador *">
              <select className="select" value={draft.party_id} onChange={(e) => setDraft({ ...draft, party_id: e.target.value })}>
                <option value="">Selecione…</option>
                {parties.rows.filter((p) => p.active && p.kind !== 'fornecedor').map((p) => <option key={p.id} value={p.id}>{p.name}{p.document ? ` · ${formatDocument(p.document)}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Serviço *">
              <select className="select" value={draft.service_id} onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}>
                <option value="">Selecione…</option>
                {services.rows.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}{s.tax_validated ? '' : ' (código pendente)'}</option>)}
              </select>
            </Field>
            <Field label="Valor do serviço (R$) *"><input className="input" inputMode="decimal" value={draft.amountText} onChange={(e) => setDraft({ ...draft, amountText: e.target.value })} /></Field>
            <Field label="Competência *"><input className="input" type="date" value={draft.competence_date} onChange={(e) => setDraft({ ...draft, competence_date: e.target.value })} /></Field>
            <Field full label="Discriminação do serviço *"><textarea className="input" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          </div>
          <h4 className="form-section">Pré-validação</h4>
          {draftIssues.length === 0
            ? <Callout tone="success" icon="check">Nenhuma pendência encontrada nos dados informados.</Callout>
            : <ul className="issues">{draftIssues.map((i) => <li key={i.field + i.message} className={i.severity}><Icon name={i.severity === 'bloqueante' ? 'alert' : 'info'} />{i.message}</li>)}</ul>}
          <p className="hint">A pré-validação verifica dados obrigatórios. A validação contra o XSD oficial e a assinatura digital ocorrem no backend (Etapa 3).</p>
        </Modal>
      )}

      {query && (
        <Modal title="Consultar na prefeitura (homologação)" onClose={() => setQuery(null)} onSubmit={runQuery}
          footer={<><button className="btn" type="button" onClick={() => setQuery(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={busy || !query.value.trim()}>Consultar</button></>}>
          <div className="form-grid">
            <Field label="Tipo de consulta">
              <select className="select" value={query.type} onChange={(e) => setQuery({ ...query, type: e.target.value as 'consultar_nfse' })}>
                <option value="consultar_nfse">NFS-e por chave de acesso</option><option value="consultar_dps">DPS por identificador</option>
              </select>
            </Field>
            <Field label={query.type === 'consultar_nfse' ? 'Chave de acesso' : 'Id da DPS'}><input className="input mono" value={query.value} onChange={(e) => setQuery({ ...query, value: e.target.value.replace(/\s/g, '') })} autoFocus /></Field>
          </div>
          <p className="hint">A consulta é feita pelo backend com o certificado da ASSOCIAPEC e fica registrada no histórico.</p>
        </Modal>
      )}
    </>
  );
}

export function FiscalSettings() {
  const { profile } = useAuth();
  const issuers = useTable('fiscal_issuer');
  const { run, busy } = useMutation();
  const writable = can(profile?.role, 'write', 'fiscal_issuer');
  const [form, setForm] = useState<FiscalIssuer | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const current = issuers.rows.find((i) => i.environment === 'homologacao');

  useEffect(() => { if (current && !form) setForm({ ...current }); }, [current, form]);

  const set = <K extends keyof FiscalIssuer>(k: K, v: FiscalIssuer[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof FiscalIssuer) => ({
    value: (form?.[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    disabled: !writable,
  });

  const save = async () => {
    if (!form) return;
    const errs: Record<string, string> = {};
    const cnpj = form.cnpj ? onlyDigits(form.cnpj) : null;
    if (cnpj && !isValidCNPJ(cnpj)) errs.cnpj = 'CNPJ inválido.';
    if (form.city_ibge_code && !/^\d{7}$/.test(form.city_ibge_code)) errs.city_ibge_code = 'Código IBGE tem 7 dígitos.';
    if (!(form.next_dps_number >= 1)) errs.next = 'Número deve ser maior que zero.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const { environment, ...patch } = { ...form, cnpj };
    await run((s) => s.update('fiscal_issuer', environment, patch), 'Dados fiscais salvos.');
  };

  if (issuers.loading) return <Loading />;
  if (issuers.error) return <ErrorBox message={issuers.error} />;
  if (!form) return <Empty>Configuração fiscal não encontrada.</Empty>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
      <PageHead title="Dados fiscais da ASSOCIAPEC" subtitle="Prestador de serviços na NFS-e · ambiente de homologação"
        actions={writable && <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>} />
      {!writable && <Callout tone="info">Somente os perfis Fiscal e Administrador alteram estes dados.</Callout>}
      <div className="grid g-1-1 mt">
        <div className="card card-pad">
          <h3 className="mb">Prestador</h3>
          <div className="form-grid">
            <Field label="CNPJ" error={errors.cnpj}><input className="input" inputMode="numeric" {...text('cnpj')} value={form.cnpj ? formatDocument(form.cnpj) : ''} onChange={(e) => set('cnpj', onlyDigits(e.target.value).slice(0, 14) || null)} /></Field>
            <Field label="Inscrição municipal"><input className="input" {...text('municipal_registration')} /></Field>
            <Field full label="Razão social"><input className="input" {...text('legal_name')} /></Field>
            <Field full label="Nome fantasia"><input className="input" {...text('trade_name')} /></Field>
            <Field label="Código IBGE do município" error={errors.city_ibge_code} hint="Confirmar com a documentação municipal"><input className="input" inputMode="numeric" {...text('city_ibge_code')} /></Field>
            <Field label="Regime tributário" hint="Conforme orientação da contabilidade"><input className="input" {...text('tax_regime')} /></Field>
            <Field label="Optante pelo Simples Nacional">
              <select className="select" disabled={!writable} value={form.simples_nacional === null ? '' : String(form.simples_nacional)} onChange={(e) => set('simples_nacional', e.target.value === '' ? null : e.target.value === 'true')}>
                <option value="">A confirmar</option><option value="true">Sim</option><option value="false">Não</option>
              </select>
            </Field>
            <Field label="E-mail"><input className="input" type="email" {...text('email')} /></Field>
            <Field label="Telefone"><input className="input" {...text('phone')} /></Field>
            <Field full label="Endereço"><input className="input" {...text('address')} /></Field>
          </div>
        </div>
        <div className="stack">
          <div className="card card-pad">
            <h3 className="mb">Certificado digital</h3>
            <Callout tone="info" icon="lock">
              Esta tela guarda <b>apenas informações</b> sobre o certificado. O arquivo, a senha e a chave privada
              <b> nunca</b> são enviados pelo navegador: serão configurados diretamente como segredos do backend fiscal.
            </Callout>
            <div className="form-grid mt">
              <Field label="Tipo">
                <select className="select" disabled={!writable} value={form.certificate_type} onChange={(e) => set('certificate_type', e.target.value as FiscalIssuer['certificate_type'])}>
                  <option value="a_confirmar">A confirmar</option><option value="A1">A1 (arquivo)</option><option value="A3">A3 (token/cartão)</option>
                </select>
              </Field>
              <Field label="Válido até"><input className="input" type="date" {...text('certificate_valid_until')} /></Field>
              <Field full label="Observações" hint="Ex.: titular, responsável pela guarda, condições de uso"><textarea className="input" rows={2} {...text('certificate_notes')} /></Field>
            </div>
            {form.certificate_type === 'A3' && <Callout tone="warning" icon="alert">Certificados A3 exigem hardware físico e normalmente não podem ser usados por um servidor em nuvem. Avaliar com a ASSOCIAPEC antes da Etapa 3.</Callout>}
          </div>
          <div className="card card-pad">
            <h3 className="mb">Numeração da DPS</h3>
            <div className="form-grid">
              <Field label="Série"><input className="input" {...text('dps_series')} /></Field>
              <Field label="Próximo número" error={errors.next}><input className="input" type="number" min={1} disabled={!writable} value={form.next_dps_number} onChange={(e) => set('next_dps_number', Number(e.target.value))} /></Field>
            </div>
            <p className="hint">A numeração é consumida pelo backend no momento do envio.</p>
          </div>
          <div className="card card-pad">
            <h3 className="mb">Ambientes</h3>
            <dl className="kv">
              <dt>Homologação</dt><dd><Badge tone="info">Em preparação</Badge> <code className="small">{NFSE_BASE_URL.homologacao}</code></dd>
              <dt>Produção</dt><dd><Badge tone="muted">Bloqueado</Badge> <code className="small">{NFSE_BASE_URL.producao}</code></dd>
            </dl>
            <p className="hint">A produção só pode ser liberada no backend, após aprovação formal da homologação.</p>
          </div>
        </div>
      </div>
    </form>
  );
}
