import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Badge, Callout, Empty, ErrorBox, Field, Loading, PageHead } from '../components/ui';
import { useMutation, useTable } from '../data/DataContext';
import { brl, parseMoney } from '../lib/format';
import { can } from '../lib/permissions';
import type { Category, Service } from '../lib/types';

export function Categories() {
  const { profile } = useAuth();
  const { confirm } = useFeedback();
  const cats = useTable('categories');
  const { run, busy } = useMutation();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const writable = can(profile?.role, 'write', 'categories');

  const save = async () => {
    if (!editing) return;
    const name = (editing.name ?? '').trim();
    if (name.length < 2) { setError('Informe o nome da categoria.'); return; }
    const payload = { name, type: editing.type ?? 'receita', active: editing.active ?? true };
    const ok = await run((s) => (editing.id ? s.update('categories', editing.id, payload) : s.insert('categories', payload)), 'Categoria salva.');
    if (ok) setEditing(null);
  };

  const section = (type: Category['type']) => {
    const list = cats.rows.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return (
      <div className="card">
        <div className="card-head"><h3>{type === 'receita' ? 'Receitas' : 'Despesas'}</h3><small>{list.length} categoria(s)</small></div>
        {list.length === 0 ? <Empty>Nenhuma categoria.</Empty> : (
          <ul className="list">
            {list.map((c) => (
              <li key={c.id}>
                <span className={`kpi-ico tone-${type === 'receita' ? 'success' : 'warning'}`}><Icon name="tag" /></span>
                <div className="grow"><b>{c.name}</b> {!c.active && <Badge tone="muted">Inativa</Badge>}</div>
                {writable && <>
                  <button className="btn xs" type="button" onClick={() => { setError(null); setEditing(c); }}><Icon name="edit" />Editar</button>
                  <button className="btn xs" type="button" onClick={async () => {
                    if (await confirm({ title: c.active ? 'Desativar categoria?' : 'Reativar categoria?', message: `“${c.name}” ${c.active ? 'deixará de aparecer em novos lançamentos' : 'voltará a ficar disponível'}.`, danger: c.active }))
                      await run((s) => s.update('categories', c.id, { active: !c.active }), 'Categoria atualizada.');
                  }}>{c.active ? 'Desativar' : 'Reativar'}</button>
                </>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHead title="Categorias financeiras" subtitle="Classificação de receitas e despesas usada nos lançamentos e relatórios"
        actions={writable && <button className="btn primary" type="button" onClick={() => { setError(null); setEditing({ type: 'receita', active: true }); }}><Icon name="plus" />Nova categoria</button>} />
      {cats.error && <ErrorBox message={cats.error} />}
      {cats.loading ? <Loading /> : <div className="grid g-1-1">{section('receita')}{section('despesa')}</div>}
      {editing && (
        <Modal title={editing.id ? 'Editar categoria' : 'Nova categoria'} onClose={() => setEditing(null)} onSubmit={save}
          footer={<><button className="btn" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>Salvar</button></>}>
          <div className="form-grid">
            <Field full label="Nome *" error={error}><input className="input" autoFocus value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className="select" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as Category['type'] })}>
                <option value="receita">Receita</option><option value="despesa">Despesa</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}

type ServiceDraft = Partial<Service> & { amountText?: string; issText?: string };

export function Services() {
  const { profile } = useAuth();
  const services = useTable('services');
  const cats = useTable('categories');
  const { run, busy } = useMutation();
  const [editing, setEditing] = useState<ServiceDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const writable = can(profile?.role, 'write', 'services');
  // a validação tributária é responsabilidade do fiscal/admin (com a contabilidade)
  const canValidateTax = profile?.role === 'admin' || profile?.role === 'fiscal';

  const open = (s?: Service) => {
    setErrors({});
    setEditing(s ? { ...s, amountText: s.default_amount != null ? String(s.default_amount).replace('.', ',') : '', issText: s.iss_rate != null ? String(s.iss_rate).replace('.', ',') : '' }
      : { active: true, tax_validated: false, amountText: '', issText: '' });
  };

  const save = async () => {
    if (!editing) return;
    const errs: Record<string, string> = {};
    const name = (editing.name ?? '').trim();
    if (name.length < 2) errs.name = 'Informe o nome do serviço.';
    const amount = editing.amountText ? parseMoney(editing.amountText) : null;
    if (amount !== null && (isNaN(amount) || amount < 0)) errs.amount = 'Valor inválido.';
    const iss = editing.issText ? parseMoney(editing.issText) : null;
    if (iss !== null && (isNaN(iss) || iss < 0 || iss > 100)) errs.iss = 'Alíquota inválida.';
    const cTrib = editing.c_trib_mun?.trim() || null;
    if (editing.tax_validated && !cTrib) errs.c_trib_mun = 'Informe o cTribMun antes de marcar como validado.';
    if (editing.tax_validated && !editing.tax_validated_by?.trim()) errs.validated_by = 'Informe quem validou (contabilidade).';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const original = services.rows.find((s) => s.id === editing.id);
    const taxChanged = !!original && (original.c_trib_mun !== cTrib || original.iss_rate !== iss || original.c_trib_nac !== (editing.c_trib_nac?.trim() || null));
    // alterar o código invalida a validação anterior
    const validated = taxChanged && original?.tax_validated && editing.tax_validated === original.tax_validated ? false : !!editing.tax_validated;
    const payload: Partial<Service> = {
      name, description: editing.description?.trim() || null, default_amount: amount, category_id: editing.category_id || null,
      c_trib_mun: cTrib, c_trib_nac: editing.c_trib_nac?.trim() || null, nbs: editing.nbs?.trim() || null, iss_rate: iss,
      tax_validated: validated, tax_validated_by: validated ? editing.tax_validated_by?.trim() || null : null,
      tax_validated_at: validated ? (original?.tax_validated && !taxChanged ? original.tax_validated_at : new Date().toISOString()) : null,
      tax_notes: editing.tax_notes?.trim() || null, active: editing.active ?? true,
    };
    const ok = await run((s) => (editing.id ? s.update('services', editing.id, payload) : s.insert('services', payload)),
      taxChanged && original?.tax_validated && !validated ? 'Serviço salvo. O código foi alterado e precisa de nova validação.' : 'Serviço salvo.');
    if (ok) setEditing(null);
  };

  const field = (k: keyof ServiceDraft, disabled = !writable) => ({
    value: (editing?.[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setEditing((d) => ({ ...d!, [k]: e.target.value })),
    disabled,
  });

  return (
    <>
      <PageHead title="Serviços prestados" subtitle="Catálogo de serviços e respectivos códigos tributários para a NFS-e"
        actions={writable && <button className="btn primary" type="button" onClick={() => open()}><Icon name="plus" />Novo serviço</button>} />
      <Callout tone="warning" icon="alert">
        O código de tributação municipal (<b>cTribMun</b>) é obrigatório na NFS-e de Campo Grande/MS e deve ser escolhido
        na tabela oficial de atividades da SEFAZ <b>e validado pela contabilidade</b>. O sistema não sugere códigos nem alíquotas.
      </Callout>
      {services.error && <ErrorBox message={services.error} />}
      <div className="card mt">
        {services.loading ? <Loading /> : services.rows.length === 0 ? <Empty>Nenhum serviço cadastrado.</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Serviço</th><th className="num">Valor padrão</th><th>cTribMun</th><th>Situação fiscal</th><th /></tr></thead>
              <tbody>
                {services.rows.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => open(s)}>
                    <td className="td-main" data-label="Serviço"><div className="cell-main">{s.name} {!s.active && <Badge tone="muted">Inativo</Badge>}</div><div className="cell-sub">{s.description}</div></td>
                    <td className="num" data-label="Valor padrão">{s.default_amount != null ? brl(s.default_amount) : '—'}</td>
                    <td data-label="cTribMun">{s.c_trib_mun ? <code>{s.c_trib_mun}</code> : <span className="muted">não definido</span>}</td>
                    <td data-label="Situação fiscal">{s.tax_validated ? <Badge tone="success">Validado</Badge> : <Badge tone="warning">Pendente de validação</Badge>}</td>
                    <td className="actions-cell"><button className="btn xs" type="button"><Icon name="edit" />{writable ? 'Editar' : 'Ver'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal wide title={editing.id ? 'Serviço' : 'Novo serviço'} onClose={() => setEditing(null)} onSubmit={save}
          footer={<><button className="btn" type="button" onClick={() => setEditing(null)}>{writable ? 'Cancelar' : 'Fechar'}</button>{writable && <button className="btn primary" type="submit" disabled={busy}>Salvar</button>}</>}>
          <h4 className="form-section">Dados do serviço</h4>
          <div className="form-grid">
            <Field full label="Nome *" error={errors.name}><input className="input" autoFocus {...field('name')} /></Field>
            <Field full label="Descrição (texto padrão da nota)"><textarea className="input" rows={2} {...field('description')} /></Field>
            <Field label="Valor padrão (R$)" error={errors.amount}><input className="input" inputMode="decimal" placeholder="0,00" {...field('amountText')} /></Field>
            <Field label="Categoria de receita">
              <select className="select" {...field('category_id')}>
                <option value="">—</option>
                {cats.rows.filter((c) => c.type === 'receita' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <h4 className="form-section">Tributação (NFS-e)</h4>
          {!canValidateTax && <p className="hint">Somente os perfis Fiscal e Administrador alteram os dados tributários.</p>}
          <div className="form-grid">
            <Field label="cTribMun (código de tributação municipal)" error={errors.c_trib_mun} hint="Conforme a tabela oficial da SEFAZ de Campo Grande">
              <input className="input" {...field('c_trib_mun', !canValidateTax)} />
            </Field>
            <Field label="cTribNac (código nacional)" hint="Se exigido pelo layout"><input className="input" {...field('c_trib_nac', !canValidateTax)} /></Field>
            <Field label="NBS" hint="Se exigido pelo layout"><input className="input" {...field('nbs', !canValidateTax)} /></Field>
            <Field label="Alíquota ISS (%)" error={errors.iss} hint="Somente o valor informado pela contabilidade"><input className="input" inputMode="decimal" {...field('issText', !canValidateTax)} /></Field>
            <Field full label="Observações tributárias"><textarea className="input" rows={2} {...field('tax_notes', !canValidateTax)} /></Field>
            <div className="field full">
              <label className="check">
                <input type="checkbox" checked={!!editing.tax_validated} disabled={!canValidateTax}
                  onChange={(e) => setEditing({ ...editing, tax_validated: e.target.checked })} />
                <span>Códigos tributários <b>validados pela contabilidade</b> — libera o serviço para emissão de NFS-e</span>
              </label>
            </div>
            {editing.tax_validated && (
              <Field label="Validado por *" error={errors.validated_by} hint="Nome do contador/escritório responsável"><input className="input" {...field('tax_validated_by', !canValidateTax)} /></Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
