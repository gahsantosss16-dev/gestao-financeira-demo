import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Badge, Empty, ErrorBox, Field, Loading, PAGE_SIZE, PageHead, Pager, SearchBox } from '../components/ui';
import { useMutation, useTable } from '../data/DataContext';
import { formatDocument, isValidEmail, onlyDigits, validateDocument } from '../lib/documents';
import { openAmount } from '../lib/finance';
import { brl, normalize, today } from '../lib/format';
import { can } from '../lib/permissions';
import type { Party, PartyKind, PersonType } from '../lib/types';

const KIND_LABEL: Record<PartyKind, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente e fornecedor' };
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

type Draft = Omit<Party, 'id' | 'created_at'> & { id?: string };
const emptyDraft = (): Draft => ({
  kind: 'cliente', person_type: 'PJ', name: '', trade_name: null, document: null, state_registration: null,
  municipal_registration: null, email: null, phone: null, contact_name: null, cep: null, street: null, number: null,
  complement: null, district: null, city: 'Campo Grande', uf: 'MS', city_ibge_code: null, notes: null, active: true,
});

export function validateParty(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.name.trim().length < 2) e.name = 'Informe o nome ou razão social.';
  const docErr = d.document ? validateDocument(d.person_type, d.document) : null;
  if (docErr) e.document = docErr;
  if (d.email && !isValidEmail(d.email)) e.email = 'E-mail inválido.';
  if (d.cep && onlyDigits(d.cep).length !== 8) e.cep = 'CEP deve ter 8 dígitos.';
  if (d.city_ibge_code && !/^\d{7}$/.test(d.city_ibge_code)) e.city_ibge_code = 'Código IBGE tem 7 dígitos.';
  return e;
}

export function Parties() {
  const { profile } = useAuth();
  const { confirm } = useFeedback();
  const parties = useTable('parties');
  const receivables = useTable('receivables');
  const payables = useTable('payables');
  const { run, busy } = useMutation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | PartyKind>('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const writable = can(profile?.role, 'write', 'parties');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => parties.rows
    .filter((p) => showInactive || p.active)
    .filter((p) => !kind || p.kind === kind || p.kind === 'ambos')
    .filter((p) => !q || normalize([p.name, p.trade_name, p.document, formatDocument(p.document), p.email, p.phone, p.city].join(' ')).includes(normalize(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [parties.rows, q, kind, showInactive]);

  useEffect(() => setPage(0), [q, kind, showInactive]);

  const balance = (id: string) => ({
    receber: receivables.rows.filter((r) => r.party_id === id && !r.canceled_at).reduce((a, r) => a + openAmount(r), 0),
    pagar: payables.rows.filter((r) => r.party_id === id && !r.canceled_at).reduce((a, r) => a + openAmount(r), 0),
    vencido: receivables.rows.filter((r) => r.party_id === id && !r.canceled_at && r.due_date < today()).reduce((a, r) => a + openAmount(r), 0),
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((d) => (d ? { ...d, [k]: v } : d));
  const text = (k: keyof Draft) => ({
    value: (editing?.[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    disabled: !writable,
  });

  const save = async () => {
    if (!editing) return;
    const d = { ...editing, name: editing.name.trim(), document: editing.document ? onlyDigits(editing.document) : null, cep: editing.cep ? onlyDigits(editing.cep) : null };
    const errs = validateParty(d);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const { id, ...payload } = d;
    const ok = await run((s) => (id ? s.update('parties', id, payload) : s.insert('parties', payload)), id ? 'Cadastro atualizado.' : 'Cadastro criado.');
    if (ok) setEditing(null);
  };

  const toggleActive = async (p: Party) => {
    const msg = p.active ? 'O cadastro deixará de aparecer nas listas de seleção, mas o histórico é mantido.' : 'O cadastro voltará a aparecer nas listas.';
    if (await confirm({ title: p.active ? `Desativar ${p.name}?` : `Reativar ${p.name}?`, message: msg, confirmLabel: p.active ? 'Desativar' : 'Reativar', danger: p.active })) {
      await run((s) => s.update('parties', p.id, { active: !p.active }), p.active ? 'Cadastro desativado.' : 'Cadastro reativado.');
    }
  };

  return (
    <>
      <PageHead title="Clientes e fornecedores" subtitle="Pessoas físicas e jurídicas, contatos e dados fiscais"
        actions={writable && <button className="btn primary" type="button" onClick={() => { setErrors({}); setEditing(emptyDraft()); }}><Icon name="plus" />Novo cadastro</button>} />
      {parties.error && <ErrorBox message={parties.error} />}
      <div className="card">
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone ou cidade" />
          <div className="chips" role="group" aria-label="Tipo de cadastro">
            {([['', 'Todos'], ['cliente', 'Clientes'], ['fornecedor', 'Fornecedores']] as const).map(([k, l]) => (
              <button key={k} type="button" className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Mostrar inativos</label>
        </div>
        {parties.loading ? <Loading /> : rows.length === 0 ? <Empty>Nenhum cadastro encontrado.</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Contato</th><th className="num">A receber</th><th className="num">A pagar</th><th /></tr></thead>
              <tbody>
                {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => {
                  const b = balance(p.id);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => { setErrors({}); setEditing({ ...p }); }}>
                      <td className="td-main" data-label="Nome">
                        <div className="cell-main">{p.name} {!p.active && <Badge tone="muted">Inativo</Badge>}</div>
                        <div className="cell-sub">{p.person_type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}{p.city ? ` · ${p.city}/${p.uf ?? ''}` : ''}</div>
                      </td>
                      <td data-label="Tipo">{KIND_LABEL[p.kind]}</td>
                      <td data-label="CPF/CNPJ" className="nowrap">{formatDocument(p.document) || <span className="muted">não informado</span>}</td>
                      <td data-label="Contato"><div>{p.phone || '—'}</div><div className="cell-sub">{p.email}</div></td>
                      <td data-label="A receber" className="num">{brl(b.receber)}{b.vencido > 0 && <div className="cell-sub text-danger">{brl(b.vencido)} vencido</div>}</td>
                      <td data-label="A pagar" className="num">{brl(b.pagar)}</td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        {writable && <button className="btn xs" type="button" onClick={() => toggleActive(p)}>{p.active ? 'Desativar' : 'Reativar'}</button>}
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
          <h4 className="form-section">Identificação</h4>
          <div className="form-grid">
            <Field label="Tipo de cadastro">
              <select className="select" value={editing.kind} disabled={!writable} onChange={(e) => set('kind', e.target.value as PartyKind)}>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Pessoa">
              <select className="select" value={editing.person_type} disabled={!writable} onChange={(e) => set('person_type', e.target.value as PersonType)}>
                <option value="PJ">Jurídica (CNPJ)</option><option value="PF">Física (CPF)</option>
              </select>
            </Field>
            <Field full label={editing.person_type === 'PJ' ? 'Razão social *' : 'Nome completo *'} error={errors.name}>
              <input className="input" {...text('name')} value={editing.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </Field>
            {editing.person_type === 'PJ' && <Field label="Nome fantasia"><input className="input" {...text('trade_name')} /></Field>}
            <Field label={editing.person_type === 'PJ' ? 'CNPJ' : 'CPF'} error={errors.document} hint="Usado para evitar cadastros duplicados">
              <input className="input" inputMode="numeric" {...text('document')} value={editing.document ? formatDocument(editing.document) : ''}
                onChange={(e) => set('document', onlyDigits(e.target.value).slice(0, editing.person_type === 'PJ' ? 14 : 11) || null)} />
            </Field>
          </div>
          <h4 className="form-section">Contato</h4>
          <div className="form-grid">
            <Field label="E-mail" error={errors.email}><input className="input" type="email" {...text('email')} /></Field>
            <Field label="Telefone"><input className="input" type="tel" {...text('phone')} /></Field>
            <Field label="Pessoa de contato"><input className="input" {...text('contact_name')} /></Field>
          </div>
          <h4 className="form-section">Endereço</h4>
          <div className="form-grid">
            <Field label="CEP" error={errors.cep}><input className="input" inputMode="numeric" {...text('cep')} /></Field>
            <Field label="Logradouro"><input className="input" {...text('street')} /></Field>
            <Field label="Número"><input className="input" {...text('number')} /></Field>
            <Field label="Complemento"><input className="input" {...text('complement')} /></Field>
            <Field label="Bairro"><input className="input" {...text('district')} /></Field>
            <Field label="Cidade"><input className="input" {...text('city')} /></Field>
            <Field label="UF">
              <select className="select" value={editing.uf ?? ''} disabled={!writable} onChange={(e) => set('uf', e.target.value || null)}>
                <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Código IBGE do município" error={errors.city_ibge_code} hint="Necessário para o tomador da NFS-e">
              <input className="input" inputMode="numeric" {...text('city_ibge_code')} />
            </Field>
          </div>
          <h4 className="form-section">Dados fiscais</h4>
          <div className="form-grid">
            <Field label="Inscrição municipal"><input className="input" {...text('municipal_registration')} /></Field>
            <Field label="Inscrição estadual"><input className="input" {...text('state_registration')} /></Field>
            <Field full label="Observações"><textarea className="input" rows={3} {...text('notes')} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
