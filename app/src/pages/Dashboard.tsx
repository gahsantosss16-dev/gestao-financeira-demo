import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Callout, ErrorBox, Kpi, Loading, PageHead } from '../components/ui';
import { Icon } from '../components/Icon';
import { useTable } from '../data/DataContext';
import { dashboardSummary, type Period } from '../lib/finance';
import { addDays, brl, brlShort, fdate, monthLabel, today } from '../lib/format';

type PeriodKey = 'mes' | '30' | '90' | 'ano' | 'custom';

function periodFor(key: PeriodKey, t: string, custom: Period): Period {
  switch (key) {
    case 'mes': return { from: t.slice(0, 8) + '01', to: t };
    case '30': return { from: addDays(t, -29), to: t };
    case '90': return { from: addDays(t, -89), to: t };
    case 'ano': return { from: t.slice(0, 5) + '01-01', to: t };
    default: return custom;
  }
}

export function Dashboard() {
  const t = today();
  const rec = useTable('receivables');
  const pay = useTable('payables');
  const rp = useTable('receivable_payments');
  const pp = useTable('payable_payments');
  const parties = useTable('parties');
  const [key, setKey] = useState<PeriodKey>('mes');
  const [custom, setCustom] = useState<Period>({ from: addDays(t, -29), to: t });
  const period = periodFor(key, t, custom);

  const s = useMemo(() => dashboardSummary({
    receivables: rec.rows, payables: pay.rows, receivablePayments: rp.rows, payablePayments: pp.rows, period, today: t,
  }), [rec.rows, pay.rows, rp.rows, pp.rows, period.from, period.to, t]);

  const name = (id: string | null) => parties.rows.find((p) => p.id === id)?.name ?? '—';
  const loading = rec.loading || pay.loading || rp.loading || pp.loading;
  const err = rec.error || pay.error || rp.error || pp.error;

  return (
    <>
      <PageHead
        title="Painel financeiro"
        subtitle={`Período: ${fdate(period.from)} a ${fdate(period.to)}`}
        actions={<>
          <select className="select" value={key} onChange={(e) => setKey(e.target.value as PeriodKey)} aria-label="Período">
            <option value="mes">Este mês</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="ano">Este ano</option>
            <option value="custom">Personalizado</option>
          </select>
          {key === 'custom' && <>
            <input className="input date" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="De" />
            <input className="input date" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Até" />
          </>}
        </>}
      />
      {err && <ErrorBox message={err} />}
      {loading ? <Loading /> : <>
        <div className="grid kpis">
          <Kpi label="Receitas recebidas" value={brl(s.receivedInPeriod)} sub="no período" icon="in" tone="success" />
          <Kpi label="Despesas pagas" value={brl(s.paidInPeriod)} sub="no período" icon="out" tone="warning" />
          <Kpi label="Saldo do período" value={brl(s.balance)} sub={s.balance >= 0 ? 'Resultado positivo' : 'Resultado negativo'} icon="wallet" tone={s.balance >= 0 ? 'primary' : 'danger'} />
          <Kpi label="Valores vencidos" value={brl(s.overdueReceivable)} sub={<>a receber · {s.delinquentCount} inadimplente(s)</>} icon="alert" tone="danger" />
        </div>
        <div className="grid kpis">
          <Kpi label="Total a receber" value={brl(s.toReceive)} sub="em aberto" icon="money" tone="info" />
          <Kpi label="Total a pagar" value={brl(s.toPay)} sub="em aberto" icon="clock" tone="primary" />
          <Kpi label="Contas a pagar vencidas" value={brl(s.overduePayable)} sub="exigem atenção" icon="alert" tone={s.overduePayable > 0 ? 'danger' : 'success'} />
          <Kpi label="Vencem em 7 dias" value={String(s.upcoming.length)} sub={brlShort(s.upcoming.reduce((a, u) => a + u.open, 0))} icon="clock" tone="warning" />
        </div>
        <div className="grid g-2-1">
          <div className="card">
            <div className="card-head">
              <h3>Receitas x despesas (realizado)</h3>
              <div className="legend"><span><i style={{ background: 'var(--success)' }} />Receitas</span><span><i style={{ background: 'var(--warning)' }} />Despesas</span></div>
            </div>
            <div className="card-pad">
              <BarChart labels={s.monthly.map((m) => monthLabel(m.month))} series={[
                { name: 'Receitas', color: 'var(--success)', values: s.monthly.map((m) => m.receitas) },
                { name: 'Despesas', color: 'var(--warning)', values: s.monthly.map((m) => m.despesas) },
              ]} />
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Próximos vencimentos</h3><small>7 dias</small></div>
            {s.upcoming.length === 0
              ? <div className="card-pad muted">Nenhuma conta vence nos próximos 7 dias.</div>
              : <ul className="list">
                  {s.upcoming.slice(0, 8).map((u) => (
                    <li key={u.kind + u.id}>
                      <span className={`kpi-ico tone-${u.kind === 'receber' ? 'success' : 'warning'}`}><Icon name={u.kind === 'receber' ? 'in' : 'out'} /></span>
                      <div className="grow">
                        <div className="truncate fw">{u.description}</div>
                        <div className="cell-sub truncate">{name(u.party_id)} · {u.due_date === t ? 'hoje' : fdate(u.due_date)}</div>
                      </div>
                      <span className={`amount ${u.kind === 'pagar' ? 'text-warning' : 'text-success'}`}>{u.kind === 'pagar' ? '−' : '+'}{brl(u.open)}</span>
                    </li>
                  ))}
                </ul>}
            <div className="card-pad row">
              <Link className="btn sm" to="/receber?status=vencido">Ver vencidos a receber</Link>
              <Link className="btn sm" to="/pagar">Contas a pagar</Link>
            </div>
          </div>
        </div>
        <div className="mt">
          <Callout tone="info" icon="info">
            Os valores do painel consideram apenas lançamentos não cancelados. Receitas e despesas do período
            são calculadas pela <b>data do pagamento</b> (regime de caixa).
          </Callout>
        </div>
      </>}
    </>
  );
}
