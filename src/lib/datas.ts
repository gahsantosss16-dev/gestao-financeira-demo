// Datas financeiras são "dia civil" (yyyy-mm-dd), sem fuso. Comparar como
// texto evita o erro já corrigido no Neuro Hub Pro (financePeriod.ts), em que
// um lançamento aparecia no card do mês e sumia da tabela por causa do horário.

export function hojeIso(reference: Date = new Date()): string {
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, "0");
  const d = String(reference.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function fimDoMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** Soma meses mantendo o dia, limitado ao último dia do mês de destino. */
export function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = new Date(y, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return hojeIso(alvo);
}

export function formatDataBr(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function estaNoPeriodo(iso: string, inicio: string, fim: string): boolean {
  return iso >= inicio && iso <= fim;
}
