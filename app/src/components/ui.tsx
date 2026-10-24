import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_META, type AccountStatus } from '../lib/finance';
import { Icon } from './Icon';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export const Badge = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`badge tone-${tone}`}>{children}</span>;
export const StatusBadge = ({ status }: { status: AccountStatus }) => <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>;

export function Kpi({ label, value, sub, icon, tone, to }: { label: string; value: string; sub?: ReactNode; icon: string; tone: string; to?: string }) {
  const body = <>
    <div className="kpi-top"><span>{label}</span><span className={`kpi-ico tone-${tone}`}><Icon name={icon} /></span></div>
    <div className="kpi-val">{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </>;
  return to ? <Link className={`card kpi kpi-${tone}`} to={to} aria-label={`${label}: ${value}. Ver registros`}>{body}</Link> : <div className={`card kpi kpi-${tone}`}>{body}</div>;
}

export function Empty({ children, icon = 'search' }: { children: ReactNode; icon?: string }) {
  return <div className="empty"><Icon name={icon} /><div>{children}</div></div>;
}

export function Callout({ tone = 'info', icon = 'info', children }: { tone?: string; icon?: string; children: ReactNode }) {
  return <div className={`callout tone-${tone}`}><Icon name={icon} /><div>{children}</div></div>;
}

export function Field({ label, error, hint, children, full }: { label: string; error?: string | null; hint?: ReactNode; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''} ${error ? 'has-error' : ''}`}>
      <label>{label}{children}</label>
      {error ? <div className="error-text" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Loading() {
  return <div className="empty"><div className="spinner" aria-label="Carregando" /></div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <Callout tone="danger" icon="alert">{message}</Callout>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <div className="search-input grow">
      <Icon name="search" />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export function BarChart({ labels, series, height = 220 }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; height?: number }) {
  const W = 640, H = height, pl = 52, pr = 8, pt = 12, pb = 26;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const cw = (W - pl - pr) / labels.length;
  const bw = Math.min(22, (cw - 10) / series.length);
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(' e ') + ' por mês'}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pt + (H - pt - pb) * (1 - f);
        return <g key={f}><line className="grid-line" x1={pl} x2={W - pr} y1={y} y2={y} /><text x={pl - 6} y={y + 4} textAnchor="end">{fmt(top * f)}</text></g>;
      })}
      {labels.map((l, i) => {
        const x0 = pl + i * cw + (cw - bw * series.length) / 2;
        return (
          <g key={l}>
            {series.map((s, k) => {
              const h = ((H - pt - pb) * s.values[i]) / top;
              return <rect key={s.name} x={x0 + k * bw} y={H - pb - h} width={bw - 3} height={Math.max(0, h)} rx={3} fill={s.color}><title>{`${s.name} ${l}: R$ ${s.values[i].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</title></rect>;
            })}
            <text x={pl + i * cw + cw / 2} y={H - 8} textAnchor="middle">{l}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const PAGE_SIZE = 20;

/** Paginação simples no cliente; volta à primeira página quando o filtro muda. */
export function Pager({ page, total, onPage, label = 'registro(s)' }: { page: number; total: number; onPage(p: number): void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="pager">
      <span>{total > PAGE_SIZE ? `Exibindo ${from}–${to} de ${total} ${label}` : `${total} ${label}`}</span>
      {pages > 1 && (
        <div className="btns">
          <button className="btn sm" type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
          <button className="btn sm" type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

/** Aviso exibido quando um recurso depende da migração operacional ainda não aplicada. */
export function SchemaPending({ feature }: { feature: string }) {
  return (
    <Callout tone="warning" icon="lock">
      <b>{feature}</b> depende da atualização do banco de dados (migração <code>operacional</code>), que aguarda
      autorização para ser aplicada no Supabase. Os demais recursos continuam funcionando normalmente.
    </Callout>
  );
}

