/** Posição logo após o n-ésimo dígito de um texto mascarado. */
export function posicaoAposDigitos(formatado: string, digitos: number): number {
  if (digitos <= 0) return 0;
  let contados = 0;
  for (let i = 0; i < formatado.length; i += 1) {
    if (/\d/.test(formatado[i])) contados += 1;
    if (contados === digitos) return i + 1;
  }
  return formatado.length;
}
