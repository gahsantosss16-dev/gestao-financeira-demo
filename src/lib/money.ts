// Dinheiro sempre em centavos inteiros (mesmo princípio do MoneyInput do
// Neuro Hub Pro, que corrigiu "2.000" virando R$ 2,00 com parseFloat).
// O banco guarda bigint em centavos; nunca usar float para somar valores.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCentavos(centavos: number): string {
  return BRL.format(centavos / 100);
}

/** Converte o texto digitado em centavos considerando apenas os dígitos. */
export function digitosParaCentavos(texto: string): number {
  const digits = texto.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return 0;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : 0;
}

/**
 * Divide um valor em N parcelas sem perder centavos: a diferença do
 * arredondamento vai para a primeira parcela, e a soma é sempre o total.
 */
export function dividirEmParcelas(totalCentavos: number, parcelas: number): number[] {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) throw new Error("Valor total inválido.");
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) throw new Error("Quantidade de parcelas inválida.");
  const base = Math.floor(totalCentavos / parcelas);
  const resto = totalCentavos - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? base + resto : base));
}
