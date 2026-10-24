const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number | null | undefined) => BRL.format(v || 0);
export const brlShort = (v: number) =>
  Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(v);

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const fdate = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
export const fdatetime = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? fdate(d) : dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}
/** Soma meses preservando o dia (limitado ao último dia do mês). */
export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return isoDate(target);
}
export const diffDays = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
};

export const normalize = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Converte "1.234,56" ou "1234.56" em número; retorna NaN se inválido. */
export function parseMoney(input: string): number {
  const s = input.trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Math.round(Number(normalized) * 100) / 100 : NaN;
}
export const round2 = (v: number) => Math.round(v * 100) / 100;
