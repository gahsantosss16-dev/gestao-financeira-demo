import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Badge, Callout, Empty, ErrorBox, Loading, PageHead, SearchBox } from '../components/ui';
import { useMutation, useTable } from '../data/DataContext';
import { fdatetime, normalize } from '../lib/format';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../lib/permissions';
import type { AuditEntry, Role } from '../lib/types';

export function Users() {
  const { profile, mode } = useAuth();
  const { confirm } = useFeedback();
  const users = useTable('profiles');
  const { run, busy } = useMutation();

  const changeRole = async (id: string, name: string, role: Role) => {
    if (await confirm({ title: 'Alterar perfil de acesso?', message: <><b>{name}</b> passará a ter o perfil <b>{ROLE_LABEL[role]}</b>: {ROLE_DESCRIPTION[role].toLowerCase()}.</>, confirmLabel: 'Alterar' }))
      await run((s) => s.update('profiles', id, { role }), 'Perfil alterado.');
  };
  const toggle = async (id: string, name: string, active: boolean) => {
    if (await confirm({ title: active ? 'Desativar usuário?' : 'Reativar usuário?', message: active ? <><b>{name}</b> perderá o acesso ao sistema imediatamente.</> : <><b>{name}</b> voltará a acessar o sistema.</>, danger: active, confirmLabel: active ? 'Desativar' : 'Reativar' }))
      await run((s) => s.update('profiles', id, { active: !active }), active ? 'Usuário desativado.' : 'Usuário reativado.');
  };

  return (
    <>
      <PageHead title="Usuários e perfis" subtitle="Controle de acesso por perfil" />
      <Callout tone="info">
        {mode === 'supabase'
          ? <>Novos usuários são convidados pelo painel do Supabase (Authentication → Users → Invite) e entram com perfil <b>Consulta</b>. Depois, ajuste o perfil aqui.</>
          : <>No modo demonstração os usuários são fixos. Com o Supabase conectado, os convites são feitos pelo painel do Supabase.</>}
      </Callout>
      <div className="grid kpis mt">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="card card-pad"><b>{ROLE_LABEL[r]}</b><div className="cell-sub">{ROLE_DESCRIPTION[r]}</div></div>
        ))}
      </div>
      {users.error && <ErrorBox message={users.error} />}
      <div className="card">
        {users.loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {users.rows.map((u) => (
                  <tr key={u.id}>
                    <td className="td-main" data-label="Usuário"><div className="cell-main">{u.full_name || '—'}{u.id === profile?.id && <> <Badge tone="info">você</Badge></>}</div><div className="cell-sub">{u.email}</div></td>
                    <td data-label="Perfil">
                      <select className="select" value={u.role} disabled={busy || u.id === profile?.id || mode === 'demo'} onChange={(e) => changeRole(u.id, u.full_name || u.email || '', e.target.value as Role)} aria-label="Perfil">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td data-label="Situação">{u.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</td>
                    <td className="actions-cell">{u.id !== profile?.id && mode !== 'demo' && <button className="btn xs" type="button" onClick={() => toggle(u.id, u.full_name || u.email || '', u.active)}>{u.active ? 'Desativar' : 'Reativar'}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const TABLE_LABEL: Record<string, string> = {
  parties: 'Cadastro', categories: 'Categoria', services: 'Serviço', receivables: 'Conta a receber', receivable_payments: 'Recebimento',
  payables: 'Conta a pagar', payable_payments: 'Pagamento', attachments: 'Anexo', profiles: 'Usuário', fiscal_issuer: 'Dados fiscais',
  nfse_documents: 'Documento fiscal', nfse_events: 'Evento fiscal',
};
const ACTION: Record<AuditEntry['action'], { label: string; tone: string }> = {
  INSERT: { label: 'Criação', tone: 'success' }, UPDATE: { label: 'Alteração', tone: 'info' }, DELETE: { label: 'Exclusão', tone: 'danger' },
};
const IGNORED = new Set(['updated_at', 'created_at']);

function changes(e: AuditEntry) {
  if (e.action !== 'UPDATE' || !e.old_data || !e.new_data) return null;
  const keys = Object.keys(e.new_data).filter((k) => !IGNORED.has(k) && JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]));
  return keys.map((k) => `${k}: ${JSON.stringify(e.old_data![k] ?? null)} → ${JSON.stringify(e.new_data![k] ?? null)}`);
}
const summary = (e: AuditEntry) => {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>;
  return String(d.name ?? d.description ?? d.full_name ?? d.file_name ?? (d.amount != null ? `R$ ${d.amount}` : e.record_id ?? ''));
};

export function Audit() {
  const audit = useTable('audit_log');
  const users = useTable('profiles');
  const [q, setQ] = useState('');
  const [table, setTable] = useState('');
  const who = (id: string | null) => (id ? users.rows.find((u) => u.id === id)?.full_name || id.slice(0, 8) : 'Sistema');
  const rows = useMemo(() => audit.rows
    .filter((e) => !table || e.table_name === table)
    .filter((e) => !q || normalize(JSON.stringify(e.new_data ?? e.old_data) + who(e.actor)).includes(normalize(q))), [audit.rows, q, table, users.rows]);

  return (
    <>
      <PageHead title="Auditoria" subtitle="Registro automático de criações, alterações e exclusões (gerado pelo banco de dados)" />
      {audit.error && <ErrorBox message={audit.error} />}
      <div className="card">
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por conteúdo ou usuário" />
          <select className="select" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Tipo de registro">
            <option value="">Todos os registros</option>
            {Object.entries(TABLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {audit.loading ? <Loading /> : rows.length === 0 ? <Empty icon="history">Nenhum registro de auditoria.</Empty> : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((e) => {
                  const diff = changes(e);
                  return (
                    <tr key={e.id}>
                      <td data-label="Data" className="nowrap">{fdatetime(e.at)}</td>
                      <td data-label="Usuário">{who(e.actor)}</td>
                      <td data-label="Ação"><Badge tone={ACTION[e.action].tone}>{ACTION[e.action].label}</Badge></td>
                      <td data-label="Registro"><div className="cell-main">{TABLE_LABEL[e.table_name] ?? e.table_name}</div><div className="cell-sub truncate">{summary(e)}</div></td>
                      <td data-label="Detalhes" className="small mono audit-diff">{diff ? diff.slice(0, 4).join('\n') : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
