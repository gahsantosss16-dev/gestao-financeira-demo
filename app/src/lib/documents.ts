export const onlyDigits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

export function isValidCPF(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatDocument(value: string | null | undefined) {
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value || '';
}

export function validateDocument(personType: 'PF' | 'PJ', value: string): string | null {
  const d = onlyDigits(value);
  if (!d) return null;
  if (personType === 'PF') return isValidCPF(d) ? null : 'CPF inválido';
  return isValidCNPJ(d) ? null : 'CNPJ inválido';
}

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---------------------------------------------------------------------------
// Máscaras progressivas (portadas do LSB — src/lib/documento.ts): aplicadas
// enquanto a pessoa digita; o valor gravado continua sendo só dígitos.
// ---------------------------------------------------------------------------
export function formatDocumentProgressive(raw: string | null | undefined, personType?: 'PF' | 'PJ'): string {
  const d = onlyDigits(raw);
  if (!d) return '';
  const asCpf = personType ? personType === 'PF' : d.length <= 11;
  if (asCpf) {
    return d.slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  return d.slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

export function formatCep(raw: string | null | undefined): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

// (67) 3333-3333 (10 dígitos) ou (67) 99999-9999 (11 dígitos)
export function formatPhone(raw: string | null | undefined): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Raiz do CNPJ (8 primeiros dígitos): identifica matriz e filiais (LSB). */
export const cnpjRoot = (doc: string | null | undefined) => {
  const d = onlyDigits(doc);
  return d.length === 14 ? d.slice(0, 8) : null;
};
