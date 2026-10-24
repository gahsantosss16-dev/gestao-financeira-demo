import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { TextInput } from '../components/TextInput';
import { Badge, Callout, Empty, ErrorBox, Field, Loading, PAGE_SIZE, PageHead, Pager, SearchBox } from '../components/ui';
import { useMutation, useSchemaV2, useTable } from '../data/DataContext';
import { cnpjRoot, formatCep, formatDocument, formatDocumentProgressive, formatPhone, isValidEmail, onlyDigits, validateDocument } from '../lib/documents';
import { openAmount } from '../lib/finance';
import { brl, fdatetime, normalize, today } from '../lib/format';
import { formatIE, IE_LOOKUP_LINKS, normalizeIE, UFS, validateIE } from '../lib/ie';
import { lookupCep, lookupCnpj } from '../lib/lookups';
import { can } from '../lib/permissions';
import { similarNames } from '../lib/text';
import type { Party, PartyKind, PartyRegistration, PersonType } from '../lib/types';

const KIND_LABEL: Record<PartyKind, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente e fornecedor' };
const IE_STATUS = ['', 'Ativa', 'Suspensa', 'Baixada', 'Cancelada', 'Não habilitada'];

export interface RegDraft {
  id?: string;
  uf: string;
  ie: string;
  property_name: string;
  city: string;
  status: string;
  checked_at: string | null;
  active: boolean;
}
export type PartyDraft = Omit<Party, 'id' | 'created_at'> & { id?: string; regs: RegDraft[]; noIe: boolean };

const emptyReg = (uf = 'MS'): RegDraft => ({ uf, ie: '', property_name: '', city: '', status: '', checked_at: null, active: true });
const emptyDraft = (): PartyDraft => ({
  kind: 'cliente', person_type: 'PF', name: '', trade_name: null, document: null, state_registration: null,
  municipal_registration: null, email: null, phone: null, contact_name: null, cep: null, street: null, number: null,
  complement: null, district: null, city: 'Campo Grande', uf: 'MS', city_ibge_code: null, notes: null, active: true,
  rural_producer: true, regs: [emptyReg()], noIe: false,
});

/** Validação do formulário (exportada para teste). */
export function validatePartyDraft(d: PartyDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.name.trim().length < 2) e.name = 'Informe o nome ou razão social.';
  const docErr = d.document ? validateDocument(d.person_type, d.document) : null;
  if (docErr) e.document = docErr;
  if (d.email && !isValidEmail(d.email)) e.email = 'E-mail inválido.';
  if (d.cep && onlyDigits(d.cep).length !== 8) e.cep = 'CEP deve ter 8 dígitos.';
  if (d.city_ibge_code && !/^\d{7}$/.test(d.city_ibge_code)) e.city_ibge_code = 'Código IBGE tem 7 dígitos.';
  const active = d.noIe ? [] : d.regs.filter((r) => r.active);
  if (d.rural_producer && !d.noIe && !normalizeIE(active[0]?.ie)) e['reg0.ie'] = 'Produtor rural: informe a inscrição estadual ou marque “Sem inscrição estadual”.';
  const seen = new Set<string>();
  active.forEach((r, i) => {
    if (!normalizeIE(r.ie) && i > 0) { e[`reg${i}.ie`] = 'Informe a inscrição ou remova a linha.'; return; }
    if (!normalizeIE(r.ie)) return;
    const err = validateIE(r.uf, r.ie);
    if (err) e[`reg${i}.ie`] = err;
    const key = `${r.uf}:${normalizeIE(r.ie)}`;
    if (seen.has(key)) e[`reg${i}.ie`] = 'Inscrição repetida neste cadastro.';
    seen.add(key);
  });
  if (!d.document && (d.noIe || !normalizeIE(active[0]?.ie)) && d.kind !== 'fornecedor') {
    e.document = e.document ?? 'Informe o CPF/CNPJ ou a inscrição estadual para identificar o cliente.';
  }
  return e;
}

export function Parties() {
  const { profile, source } = useAuth();
  const { confirm, toast } = useFeedback();
  const v2 = useSchemaV2();
  const parties = useTable('parties');
  const regs = useTable('party_registrations', v2);
  const receivables = useTable('receivables');
  const payables = useTable('payables');
  const audit = useTable('audit_log', profile?.role === 'admin');
  const { run, busy } = useMutation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | PartyKind | 'rural'>('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<PartyDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ieHelp, setIeHelp] = useState<number | null>(null);
  const [lookingUp, setLookingUp] = useState<'cnpj' | 'cep' | null>(null);
  const [cnpjIes, setCnpjIes] = useState<{ uf: string; ie: string; active: boolean }[]>([]);
  const [page, setPage] = useState(0);
  const writable = can(profile?.role, 'write', 'parties');

  const regsByParty = useMemo(() => {
    const m = new Map<string, PartyRegistration[]>();
    for (const r of regs.rows) m.set(r.party_id, [...(m.get(r.party_id) ?? []), r]);
    for (const list of m.values()) list.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    return m;
  }, [regs.rows]);

  const rows = useMemo(() => parties.rows
    .filter((p) => showInactive || p.active)
    .filter((p) => !kind || (kind === 'rural' ? p.rural_producer : p.kind === kind || p.kind === 'ambos'))
    .filter((p) => {
      if (!q) return true;
      const ies = (regsByParty.get(p.id) ?? []).map((r) => `${r.ie} ${formatIE(r.uf, r.ie)} ${r.property_name ?? ''}`).join(' ');
      return normalize([p.name, p.trade_name, p.document, formatDocument(p.document), p.state_registration, ies, p.email, p.phone, p.city].join(' ')).includes(normalize(q))
        || (onlyDigits(q).length >= 3 && (onlyDigits(p.document).includes(onlyDigits(q)) || ies.includes(onlyDigits(q))));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [parties.rows, q, kind, showInactive, regsByParty]);

  useEffect(() => setPage(0), [q, kind, showInactive]);

  const balance = (id: string) => ({
    receber: receivables.rows.filter((r) => r.party_id === id && !r.canceled_at).reduce((a, r) => a + openAmount(r), 0),
    pagar: payables.rows.filter((r) => r.party_id === id && !r.canceled_at).reduce((a, r) => a + openAmount(r), 0),
    vencido: receivables.rows.filter((r) => r.party_id === id && !r.canceled_at && r.due_date < today()).reduce((a, r) => a + openAmount(r), 0),
  });

  const openParty = (p?: Party) => {
    setErrors({});
    setCnpjIes([]);
    if (!p) { setEditing(emptyDraft()); return; }
    const existing = (regsByParty.get(p.id) ?? []).filter((r) => r.active);
    const draftRegs: RegDraft[] = existing.length
      ? existing.map((r) => ({ id: r.id, uf: r.uf, ie: r.ie, property_name: r.property_name ?? '', city: r.city ?? '', status: r.status ?? '', checked_at: r.checked_at, active: true }))
      : [{ ...emptyReg(p.uf ?? 'MS'), ie: v2 ? '' : p.state_registration ?? '' }];
    setEditing({ ...p, rural_producer: !!p.rural_producer, regs: draftRegs, noIe: !draftRegs[0].ie && !p.rural_producer });
  };
  // abrir direto pelo link ?abrir=ID (ex.: alerta de duplicidade, importação)
  const openId = params.get('abrir');
  useEffect(() => {
    if (!openId || parties.loading || regs.loading) return;
    const p = parties.rows.find((x) => x.id === openId);
    params.delete('abrir');
    setParams(params, { replace: true });
    if (p) openParty(p);
  }, [openId, parties.loading, regs.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PartyDraft>(k: K, v: PartyDraft[K]) => setEditing((d) => (d ? { ...d, [k]: v } : d));
  const setReg = (i: number, patch: Partial<RegDraft>) => setEditing((d) => (d ? { ...d, regs: d.regs.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d));
  const text = (k: keyof PartyDraft) => ({
    value: (editing?.[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    disabled: !writable,
  });

  // ---- alertas de duplicidade (antes de salvar)
  const alerts = useMemo(() => {
    if (!editing) return [] as { tone: string; text: string; partyId?: string }[];
    const out: { tone: string; text: string; partyId?: string }[] = [];
    const doc = onlyDigits(editing.document);
    const others = parties.rows.filter((p) => p.id !== editing.id);
    if (doc.length === 11 || doc.length === 14) {
      const same = others.find((p) => onlyDigits(p.document) === doc);
      if (same) out.push({ tone: 'danger', text: `Já existe um cadastro com este ${doc.length === 11 ? 'CPF' : 'CNPJ'}: ${same.name}.`, partyId: same.id });
      const root = cnpjRoot(doc);
      const sameRoot = root ? others.find((p) => cnpjRoot(p.document) === root && onlyDigits(p.document) !== doc) : null;
      if (sameRoot) out.push({ tone: 'info', text: `Mesma raiz de CNPJ (matriz/filial) de ${sameRoot.name}. Confira se não é o mesmo cliente.`, partyId: sameRoot.id });
    }
    if (!editing.noIe) {
      editing.regs.filter((r) => r.active && normalizeIE(r.ie)).forEach((r) => {
        const hit = regs.rows.find((x) => x.uf === r.uf && x.ie === normalizeIE(r.ie) && x.party_id !== editing.id);
        if (hit) {
          const owner = parties.rows.find((p) => p.id === hit.party_id);
          out.push({ tone: 'danger', text: `A IE ${r.uf} ${formatIE(r.uf, r.ie)} já pertence a ${owner?.name ?? 'outro cadastro'}.`, partyId: hit.party_id });
        }
      });
    }
    if (!editing.id && editing.name.trim().length >= 5) {
      const similar = others.find((p) => similarNames(p.name, editing.name));
      if (similar && !out.some((a) => a.partyId === similar.id)) out.push({ tone: 'warning', text: `Nome parecido com um cadastro existente: ${similar.name}.`, partyId: similar.id });
    }
    return out;
  }, [editing, parties.rows, regs.rows]);

  const doLookupCnpj = async () => {
    if (!editing) return;
    setLookingUp('cnpj');
    try {
      const r = await lookupCnpj(editing.document ?? '');
      setEditing((d) => d && ({
        ...d,
        // preenche apenas o que está vazio: nunca apaga o que foi digitado
        name: d.name.trim() ? d.name : r.legalName,
        trade_name: d.trade_name || r.tradeName || null,
        email: d.email || r.email || null,
        phone: d.phone || r.phone || null,
        cep: d.cep || r.cep || null,
        street: d.street || r.street || null,
        number: d.number || r.number || null,
        complement: d.complement || r.complement || null,
        district: d.district || r.district || null,
        city: d.city && d.city !== 'Campo Grande' ? d.city : r.city || d.city,
        uf: r.uf || d.uf,
        city_ibge_code: d.city_ibge_code || r.cityIbgeCode || null,
      }));
      setCnpjIes(r.stateRegistrations);
      toast(`Dados públicos encontrados${r.situation ? ` (situação: ${r.situation})` : ''}. Revise antes de salvar.`, 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLookingUp(null);
    }
  };

  const doLookupCep = async () => {
    if (!editing) return;
    setLookingUp('cep');
    const r = await lookupCep(editing.cep ?? '');
    setLookingUp(null);
    if (!r) { toast('CEP não encontrado. Preencha o endereço manualmente.', 'error'); return; }
    setEditing((d) => d && ({ ...d, street: d.street || r.street || null, district: d.district || r.district || null, city: r.city, uf: r.uf, city_ibge_code: r.cityIbgeCode || d.city_ibge_code }));
  };

  const save = async () => {
    if (!editing) return;
    const d = { ...editing, name: editing.name.trim(), document: editing.document ? onlyDigits(editing.document) : null, cep: editing.cep ? onlyDigits(editing.cep) : null, phone: editing.phone ? onlyDigits(editing.phone) : null };
    const errs = validatePartyDraft(d);
    setErrors(errs);
    if (Object.keys(errs).length) { toast('Revise os campos destacados.', 'error'); return; }
    const blocking = alerts.find((a) => a.tone === 'danger');
    if (blocking) { toast(blocking.text, 'error'); return; }
    const { id, regs: draftRegs, noIe, ...partyFields } = d;
    const activeRegs = noIe ? [] : draftRegs.filter((r) => r.active && normalizeIE(r.ie));
    const payload: Partial<Party> = { ...partyFields };
    if (!v2) {
      // banco sem a migração operacional: IE principal no campo legado; sem coluna rural_producer
      payload.state_registration = activeRegs[0] ? normalizeIE(activeRegs[0].ie) : null;
      delete payload.rural_producer;
    }

    const saved = await run(async (s) => {
      const party = id ? await s.update('parties', id, payload) : await s.insert('parties', payload);
      if (v2) {
        const before = regsByParty.get(party.id) ?? [];
        const keepIds = new Set(activeRegs.map((r) => r.id).filter(Boolean));
        // inscrições removidas do formulário são inativadas (histórico preservado)
        for (const old of before.filter((r) => r.active && !keepIds.has(r.id))) {
          await s.update('party_registrations', old.id, { active: false, is_primary: false });
        }
        // a principal é sempre a primeira; desmarca antes para não violar a unicidade
        for (const old of before.filter((r) => r.is_primary && activeRegs[0]?.id !== r.id)) {
          await s.update('party_registrations', old.id, { is_primary: false });
        }
        for (const [i, r] of activeRegs.entries()) {
          const row = { uf: r.uf, ie: normalizeIE(r.ie), property_name: r.property_name.trim() || null, city: r.city.trim() || null, status: r.status || null, checked_at: r.checked_at, is_primary: i === 0, active: true };
          if (r.id) await s.update('party_registrations', r.id, row);
          else await s.insert('party_registrations', { ...row, party_id: party.id });
        }
      }
      return party;
    }, id ? 'Cadastro atualizado.' : 'Cadastro criado.');
    if (saved) setEditing(null);
    else if (!id) {
      // se o cadastro principal chegou a ser gravado, o formulário passa a editar o existente
      const created = (await source.list('parties')).find((p) => p.name === d.name && onlyDigits(p.document) === onlyDigits(d.document));
      if (created) setEditing((cur) => cur && { ...cur, id: created.id });
    }
  };

  const toggleActive = async (p: Party) => {
    const msg = p.active ? 'O cadastro deixará de aparecer nas listas de seleção. Lançamentos e histórico são mantidos.' : 'O cadastro voltará a aparecer nas listas.';
    if (await confirm({ title: p.active ? `Inativar ${p.name}?` : `Reativar ${p.name}?`, message: msg, confirmLabel: p.active ? 'Inativar' : 'Reativar', danger: p.active })) {
      await run((s) => s.update('parties', p.id, { active: !p.active }), p.active ? 'Cadastro inativado.' : 'Cadastro reativado.');
    }
  };

  const history = useMemo(() => {
    if (!editing?.id) return [];
    const regIds = new Set((regsByParty.get(editing.id) ?? []).map((r) => r.id));
    return audit.rows.filter((a) => (a.table_name === 'parties' && a.record_id === editing.id) || (a.table_name === 'party_registrations' && a.record_id && regIds.has(a.record_id))).slice(0, 30);
  }, [audit.rows, editing?.id, regsByParty]);

  const primaryIe = (p: Party) => {
    const list = (regsByParty.get(p.id) ?? []).filter((r) => r.active);
    if (list.length) return { text: `${list[0].uf} ${formatIE(list[0].uf, list[0].ie)}`, more: list.length - 1 };
    return p.state_registration ? { text: p.state_registration, more: 0 } : null;
  };

  return (
    <>
      <PageHead title="Clientes e fornecedores" subtitle="Produtores rurais, pessoas físicas e jurídicas — identificação por inscrição estadual e CPF/CNPJ"
        actions={writable && <>
          <Link className="btn" to="/importacao?foco=cadastro"><Icon name="upload" />Importar clientes</Link>
          <button className="btn primary" type="button" onClick={() => openParty()}><Icon name="plus" />Novo cadastro</button>
        </>} />
      {parties.error && <ErrorBox message={parties.error} />}
      <div className="card">
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome, inscrição estadual, CPF/CNPJ, e-mail ou cidade" />
          <div className="chips" role="group" aria-label="Tipo de cadastro">
            {([['', 'Todos'], ['rural', 'Produtores rurais'], ['cliente', 'Clientes'], ['fornecedor', 'Fornecedores']] as const).map(([k, l]) => (
              <button key={k} type="button" className={`chip ${kind === k ? 'active' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Mostrar inativos</label>
        </div>
        {parties.loading ? <Loading /> : rows.length === 0 ? <Empty icon="users">{q ? 'Nenhum cadastro encontrado para a busca.' : 'Nenhum cadastro ainda. Use “Novo cadastro” ou importe a planilha mensal.'}</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Nome</th><th>Inscrição estadual</th><th>CPF/CNPJ</th><th>Contato</th><th className="num">A receber</th><th className="num">A pagar</th><th /></tr></thead>
              <tbody>
                {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => {
                  const b = balance(p.id);
                  const ie = primaryIe(p);
                  return (
                    <tr key={p.id} className="clickable" tabIndex={0} onClick={() => openParty(p)} onKeyDown={(e) => { if (e.key === 'Enter') openParty(p); }}>
                      <td className="td-main" data-label="Nome">
                        <div className="cell-main">{p.name} {p.rural_producer && <Badge tone="success">Produtor rural</Badge>} {!p.active && <Badge tone="muted">Inativo</Badge>}</div>
                        <div className="cell-sub">{KIND_LABEL[p.kind]} · {p.person_type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}{p.city ? ` · ${p.city}/${p.uf ?? ''}` : ''}</div>
                      </td>
                      <td data-label="Inscrição estadual" className="nowrap">{ie ? <>{ie.text}{ie.more > 0 && <span className="cell-sub"> +{ie.more}</span>}</> : <span className="muted">—</span>}</td>
                      <td data-label="CPF/CNPJ" className="nowrap">{formatDocument(p.document) || <span className="muted">não informado</span>}</td>
                      <td data-label="Contato"><div>{formatPhone(p.phone) || '—'}</div><div className="cell-sub">{p.email}</div></td>
                      <td data-label="A receber" className="num">{brl(b.receber)}{b.vencido > 0 && <div className="cell-sub text-danger">{brl(b.vencido)} vencido</div>}</td>
                      <td data-label="A pagar" className="num">{brl(b.pagar)}</td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        {writable && <button className="btn xs" type="button" onClick={() => toggleActive(p)}>{p.active ? 'Inativar' : 'Reativar'}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={rows.length} onPage={setPage} label="cadastro(s)" />
      </div>

      {editing && (
        <Modal wide title={editing.id ? (writable ? 'Editar cadastro' : 'Detalhes do cadastro') : 'Novo cadastro'} onClose={() => setEditing(null)} onSubmit={save}
          footer={<>
            <button className="btn" type="button" onClick={() => setEditing(null)}>{writable ? 'Cancelar' : 'Fechar'}</button>
            {writable && <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>}
          </>}>
          {alerts.map((a) => (
            <div key={a.text} className="mb-sm">
              <Callout tone={a.tone} icon={a.tone === 'danger' ? 'alert' : 'info'}>
                {a.text} {a.partyId && <button type="button" className="link-btn" onClick={() => openParty(parties.rows.find((p) => p.id === a.partyId))}>Abrir cadastro existente</button>}
              </Callout>
            </div>
          ))}

          <h4 className="form-section">Identificação</h4>
          <div className="form-grid">
            <Field label="Tipo de cadastro">
              <select className="select" value={editing.kind} disabled={!writable} onChange={(e) => set('kind', e.target.value as PartyKind)}>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <div className="field checks-inline">
              <label className="check"><input type="checkbox" checked={!!editing.rural_producer} disabled={!writable} onChange={(e) => set('rural_producer', e.target.checked)} />Produtor rural</label>
              <label className="check"><input type="checkbox" checked={editing.noIe} disabled={!writable} onChange={(e) => set('noIe', e.target.checked)} />Sem inscrição estadual</label>
            </div>
          </div>

          {!editing.noIe && (
            <div className="ie-highlight">
              <div className="form-grid ie-grid">
                <Field label="UF da inscrição">
                  <select className="select" value={editing.regs[0]?.uf ?? 'MS'} disabled={!writable} onChange={(e) => setReg(0, { uf: e.target.value })}>
                    {UFS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label={editing.rural_producer ? 'Inscrição Estadual *' : 'Inscrição Estadual'} error={errors['reg0.ie']} hint="Validada pelas regras da UF">
                  <TextInput numericMaskCaret inputMode="numeric" disabled={!writable} autoFocus={!editing.id}
                    value={formatIE(editing.regs[0]?.uf, editing.regs[0]?.ie)}
                    onChange={(e) => setReg(0, { ie: normalizeIE(e.target.value) })}
                    onBlur={() => {
                      const r = editing.regs[0];
                      if (r?.ie) setErrors((er) => ({ ...er, 'reg0.ie': validateIE(r.uf, r.ie) ?? '' }));
                    }} />
                </Field>
                <div className="field field-action">
                  <button className="btn" type="button" onClick={() => setIeHelp(0)} disabled={!editing.regs[0]?.ie}><Icon name="search" />Consultar IE</button>
                </div>
              </div>
              {editing.regs[0]?.status && <div className="cell-sub">Situação informada: <b>{editing.regs[0].status}</b>{editing.regs[0].checked_at ? ` (conferida em ${fdatetime(editing.regs[0].checked_at)})` : ''}</div>}
            </div>
          )}

          <div className="form-grid">
            <Field label="Pessoa">
              <select className="select" value={editing.person_type} disabled={!writable} onChange={(e) => set('person_type', e.target.value as PersonType)}>
                <option value="PF">Física (CPF)</option><option value="PJ">Jurídica (CNPJ)</option>
              </select>
            </Field>
            <Field label={editing.person_type === 'PJ' ? 'CNPJ' : 'CPF'} error={errors.document} hint={editing.person_type === 'PJ' ? 'Consulta pública gratuita preenche os dados' : 'O CPF não é enviado a serviços externos'}>
              <div className="input-with-btn">
                <TextInput numericMaskCaret inputMode="numeric" disabled={!writable}
                  value={formatDocumentProgressive(editing.document, editing.person_type)}
                  onChange={(e) => set('document', onlyDigits(e.target.value).slice(0, editing.person_type === 'PJ' ? 14 : 11) || null)}
                  onBlur={() => setErrors((er) => ({ ...er, document: editing.document ? validateDocument(editing.person_type, editing.document) ?? '' : '' }))} />
                {editing.person_type === 'PJ' && writable && (
                  <button className="btn" type="button" disabled={onlyDigits(editing.document).length !== 14 || lookingUp === 'cnpj'} onClick={doLookupCnpj}>
                    {lookingUp === 'cnpj' ? 'Consultando…' : 'Consultar CNPJ'}
                  </button>
                )}
              </div>
            </Field>
            <Field full label={editing.person_type === 'PJ' ? 'Razão social *' : 'Nome completo *'} error={errors.name}>
              <TextInput disabled={!writable} value={editing.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            {editing.person_type === 'PJ' && <Field full label="Nome fantasia"><TextInput {...text('trade_name')} /></Field>}
          </div>
          {cnpjIes.length > 0 && (
            <Callout tone="info" icon="info">
              Inscrições estaduais informadas pela base pública para este CNPJ:{' '}
              {cnpjIes.map((x) => (
                <button key={x.uf + x.ie} type="button" className="chip" onClick={() => {
                  setEditing((d) => {
                    if (!d) return d;
                    const exists = d.regs.some((r) => r.uf === x.uf && normalizeIE(r.ie) === x.ie);
                    if (exists) return d;
                    const regsNext = d.regs[0] && !d.regs[0].ie ? [{ ...d.regs[0], uf: x.uf, ie: x.ie }, ...d.regs.slice(1)] : [...d.regs, { ...emptyReg(x.uf), ie: x.ie }];
                    return { ...d, noIe: false, regs: regsNext };
                  });
                }}>{x.uf} {formatIE(x.uf, x.ie)}{x.active ? '' : ' (inativa)'} — usar</button>
              ))}
            </Callout>
          )}

          {v2 && !editing.noIe && (
            <>
              <h4 className="form-section">Outras propriedades / inscrições</h4>
              {editing.regs.slice(1).length === 0 && <p className="hint">Produtor com mais de uma propriedade? Adicione as demais inscrições estaduais.</p>}
              {editing.regs.map((r, i) => i === 0 ? null : (
                <div key={r.id ?? `new-${i}`} className="form-grid reg-row">
                  <Field label="UF"><select className="select" value={r.uf} disabled={!writable} onChange={(e) => setReg(i, { uf: e.target.value })}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
                  <Field label="Inscrição Estadual" error={errors[`reg${i}.ie`]}>
                    <TextInput numericMaskCaret inputMode="numeric" disabled={!writable} value={formatIE(r.uf, r.ie)} onChange={(e) => setReg(i, { ie: normalizeIE(e.target.value) })} />
                  </Field>
                  <Field label="Propriedade"><TextInput disabled={!writable} value={r.property_name} onChange={(e) => setReg(i, { property_name: e.target.value })} /></Field>
                  <Field label="Município"><TextInput disabled={!writable} value={r.city} onChange={(e) => setReg(i, { city: e.target.value })} /></Field>
                  {writable && (
                    <div className="field field-action reg-actions">
                      <button className="btn sm" type="button" onClick={() => setIeHelp(i)} disabled={!r.ie}>Consultar</button>
                      <button className="btn sm danger" type="button" aria-label="Remover inscrição" onClick={() => setEditing((d) => d && { ...d, regs: d.regs.filter((_, j) => j !== i) })}><Icon name="trash" /></button>
                    </div>
                  )}
                </div>
              ))}
              {writable && <button className="btn sm" type="button" onClick={() => setEditing((d) => d && { ...d, regs: [...d.regs, emptyReg(d.regs[0]?.uf ?? 'MS')] })}><Icon name="plus" />Adicionar inscrição</button>}
              <div className="form-grid mt-sm">
                <Field label="Nome da propriedade principal"><TextInput disabled={!writable} value={editing.regs[0]?.property_name ?? ''} onChange={(e) => setReg(0, { property_name: e.target.value })} /></Field>
                <Field label="Município da propriedade principal"><TextInput disabled={!writable} value={editing.regs[0]?.city ?? ''} onChange={(e) => setReg(0, { city: e.target.value })} /></Field>
              </div>
            </>
          )}

          <h4 className="form-section">Contato</h4>
          <div className="form-grid">
            <Field label="Telefone"><TextInput numericMaskCaret type="tel" inputMode="tel" disabled={!writable} value={formatPhone(editing.phone)} onChange={(e) => set('phone', onlyDigits(e.target.value) || null)} /></Field>
            <Field label="E-mail" error={errors.email}><TextInput type="email" {...text('email')} /></Field>
            <Field label="Pessoa de contato"><TextInput {...text('contact_name')} /></Field>
          </div>
          <h4 className="form-section">Endereço</h4>
          <div className="form-grid">
            <Field label="CEP" error={errors.cep}>
              <div className="input-with-btn">
                <TextInput numericMaskCaret inputMode="numeric" disabled={!writable} value={formatCep(editing.cep)} onChange={(e) => set('cep', onlyDigits(e.target.value) || null)} />
                {writable && <button className="btn" type="button" disabled={onlyDigits(editing.cep).length !== 8 || lookingUp === 'cep'} onClick={doLookupCep}>{lookingUp === 'cep' ? 'Buscando…' : 'Buscar CEP'}</button>}
              </div>
            </Field>
            <Field label="Logradouro"><TextInput {...text('street')} /></Field>
            <Field label="Número"><TextInput {...text('number')} /></Field>
            <Field label="Complemento"><TextInput {...text('complement')} /></Field>
            <Field label="Bairro"><TextInput {...text('district')} /></Field>
            <Field label="Cidade"><TextInput {...text('city')} /></Field>
            <Field label="UF">
              <select className="select" value={editing.uf ?? ''} disabled={!writable} onChange={(e) => set('uf', e.target.value || null)}>
                <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Código IBGE do município" error={errors.city_ibge_code} hint="Usado como tomador na NFS-e">
              <TextInput inputMode="numeric" {...text('city_ibge_code')} />
            </Field>
          </div>
          <h4 className="form-section">Outros dados fiscais</h4>
          <div className="form-grid">
            <Field label="Inscrição municipal"><TextInput {...text('municipal_registration')} /></Field>
            <Field full label="Observações"><textarea className="input" rows={3} {...text('notes')} /></Field>
          </div>

          {editing.id && (
            <>
              <h4 className="form-section">Financeiro</h4>
              <div className="row">
                <span>A receber: <b>{brl(balance(editing.id).receber)}</b></span>
                <span>A pagar: <b>{brl(balance(editing.id).pagar)}</b></span>
                <Link className="btn sm" to={`/receber?status=todos&cliente=${editing.id}`} onClick={() => setEditing(null)}>Ver contas a receber</Link>
                <Link className="btn sm" to={`/cobrancas?cliente=${editing.id}`} onClick={() => setEditing(null)}>Ver cobranças</Link>
              </div>
              <h4 className="form-section">Histórico de alterações</h4>
              {profile?.role !== 'admin' ? <p className="hint">O histórico completo é visível ao perfil Administrador (auditoria).</p>
                : history.length === 0 ? <p className="hint">Sem alterações registradas.</p> : (
                  <ul className="list bordered">
                    {history.map((h) => (
                      <li key={h.id}>
                        <span className={`kpi-ico tone-${h.action === 'INSERT' ? 'success' : h.action === 'DELETE' ? 'danger' : 'info'}`}><Icon name="history" /></span>
                        <div className="grow">
                          <b>{h.action === 'INSERT' ? 'Criação' : h.action === 'DELETE' ? 'Exclusão' : 'Alteração'}</b> {h.table_name === 'party_registrations' ? '· inscrição estadual' : ''}
                          <div className="cell-sub">{fdatetime(h.at)}{h.action === 'UPDATE' && h.old_data && h.new_data ? ' · ' + Object.keys(h.new_data).filter((k) => !['updated_at', 'created_at'].includes(k) && JSON.stringify(h.old_data![k]) !== JSON.stringify(h.new_data![k])).join(', ') : ''}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}
        </Modal>
      )}

      {editing && ieHelp !== null && editing.regs[ieHelp] && (
        <IeLookupDialog reg={editing.regs[ieHelp]} onClose={() => setIeHelp(null)}
          onSave={(status) => { setReg(ieHelp, { status, checked_at: status ? new Date().toISOString() : null }); setIeHelp(null); }} />
      )}
    </>
  );
}

/** Consulta oficial assistida: as SEFAZ não oferecem API pública aberta (CAPTCHA). */
function IeLookupDialog({ reg, onClose, onSave }: { reg: RegDraft; onClose(): void; onSave(status: string): void }) {
  const { toast } = useFeedback();
  const [status, setStatus] = useState(reg.status);
  const invalid = validateIE(reg.uf, reg.ie);
  return (
    <Modal title="Consultar inscrição estadual" onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Fechar</button><button className="btn primary" type="button" onClick={() => onSave(status)}>Registrar situação</button></>}>
      <dl className="kv">
        <dt>UF</dt><dd>{reg.uf}</dd>
        <dt>Inscrição</dt><dd>{formatIE(reg.uf, reg.ie)} {invalid ? <Badge tone="danger">dígito inválido</Badge> : <Badge tone="success">formato válido</Badge>}</dd>
      </dl>
      <Callout tone="info" icon="info">
        Os portais oficiais (SEFAZ/SINTEGRA) exigem verificação humana (CAPTCHA) e não oferecem API pública gratuita,
        por isso a consulta é feita no site oficial. Copie a inscrição, consulte e registre aqui a situação encontrada.
        A consulta automática pelo backend poderá usar o certificado digital da ASSOCIAPEC (serviço oficial de consulta cadastral) após sua confirmação.
      </Callout>
      <div className="row mt">
        <button className="btn" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(reg.ie); toast('Inscrição copiada.'); } catch { toast('Não foi possível copiar; selecione e copie manualmente.', 'error'); }
        }}><Icon name="paperclip" />Copiar inscrição</button>
        {IE_LOOKUP_LINKS.map((l) => <a key={l.url} className="btn" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
      </div>
      <div className="form-grid mt">
        <Field label="Situação cadastral encontrada">
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {IE_STATUS.map((s) => <option key={s} value={s}>{s || 'Não verificada'}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
