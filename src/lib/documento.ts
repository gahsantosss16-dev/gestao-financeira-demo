// Reaproveitado do LSB (src/lib/documento.ts e documento-duplicidade.ts):
// máscara progressiva CPF/CNPJ e validação dos dígitos verificadores.
// A mesma validação existe no banco (public.documento_valido), que é a
// regra definitiva; esta serve para avisar o usuário antes de salvar.

export function onlyDigits(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function formatDocumento(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.length <= 11) {
    return d
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function tipoDocumento(raw: string | null | undefined): "CPF" | "CNPJ" | null {
  const d = onlyDigits(raw);
  if (!d) return null;
  return d.length <= 11 ? "CPF" : "CNPJ";
}

function digitoVerificador(documento: string, pesos: number[]) {
  const soma = pesos.reduce((total, peso, indice) => total + Number(documento[indice]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Retorna só os dígitos quando o CPF/CNPJ é válido; caso contrário, null. */
export function documentoValido(documento: string | null | undefined): string | null {
  const d = onlyDigits(documento);
  if ((d.length !== 11 && d.length !== 14) || /^(\d)\1+$/.test(d)) return null;
  if (d.length === 11) {
    const primeiro = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${primeiro}${segundo}`) ? d : null;
  }
  const primeiro = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d.endsWith(`${primeiro}${segundo}`) ? d : null;
}

export function formatCep(raw: string | null | undefined): string {
  const d = onlyDigits(raw).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// (67) 3333-3333 (10 dígitos) ou (67) 99999-9999 (11 dígitos)
export function formatTelefone(raw: string | null | undefined): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
