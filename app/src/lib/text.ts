// Utilitários de texto portados do Neuro Hub Pro (lib/patientExcelImport.ts e
// spellcheck/correction-policy.ts): comparação de nomes tolerante a acentos,
// caixa e espaços, e distância de edição para apontar grafias parecidas.

export function normalizeName(value: string | undefined | null): string {
  if (!value) return '';
  return value.toString().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

export function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let li = 1; li <= left.length; li += 1) {
    const current = [li];
    for (let ri = 1; ri <= right.length; ri += 1) {
      current[ri] = Math.min(current[ri - 1] + 1, previous[ri] + 1, previous[ri - 1] + (left[li - 1] === right[ri - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

/** Nomes parecidos o bastante para merecer confirmação (não para associar sozinho). */
export function similarNames(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const limit = Math.max(1, Math.floor(Math.min(x.length, y.length) / 8));
  return Math.abs(x.length - y.length) <= limit && editDistance(x, y) <= limit;
}
