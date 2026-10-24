// Validação de Inscrição Estadual por UF — algoritmos do "Roteiro de Crítica da
// Inscrição Estadual" (SINTEGRA). Valida apenas formato e dígitos verificadores;
// não confirma que a inscrição existe ou está ativa (isso exige consulta à SEFAZ).
import { onlyDigits } from './documents';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export type UF = (typeof UFS)[number];

const n = (s: string) => s.split('').map(Number);
const weighted = (digits: number[], weights: number[]) => weights.reduce((acc, w, i) => acc + digits[i] * w, 0);
const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i);
/** 11 - resto; 10 ou 11 viram 0 */
const dv11 = (sum: number) => { const d = 11 - (sum % 11); return d >= 10 ? 0 : d; };
/** resto 0 ou 1 → 0; senão 11 - resto */
const dv11r = (sum: number) => { const r = sum % 11; return r <= 1 ? 0 : 11 - r; };

type Validator = (ie: string) => boolean;

const simple9 = (prefix?: RegExp, calc: (s: number) => number = dv11): Validator => (ie) =>
  ie.length === 9 && (!prefix || prefix.test(ie)) && calc(weighted(n(ie), range(9, 2))) === Number(ie[8]);

const VALIDATORS: Record<UF, Validator> = {
  AC: (ie) => {
    if (ie.length !== 13 || !ie.startsWith('01')) return false;
    const d = n(ie);
    return dv11(weighted(d, [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === d[11]
      && dv11(weighted(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === d[12];
  },
  AL: (ie) => {
    if (ie.length !== 9 || !ie.startsWith('24')) return false;
    const r = (weighted(n(ie), range(9, 2)) * 10) % 11;
    return (r === 10 ? 0 : r) === Number(ie[8]);
  },
  AP: (ie) => {
    if (ie.length !== 9 || !ie.startsWith('03')) return false;
    const base = Number(ie.slice(0, 8));
    let p = 0, dEsp = 0;
    if (base >= 3000001 && base <= 3017000) { p = 5; dEsp = 0; }
    else if (base >= 3017001 && base <= 3019022) { p = 9; dEsp = 1; }
    const sum = p + weighted(n(ie), range(9, 2));
    let d = 11 - (sum % 11);
    if (d === 10) d = 0; else if (d === 11) d = dEsp;
    return d === Number(ie[8]);
  },
  AM: (ie) => {
    if (ie.length !== 9) return false;
    const sum = weighted(n(ie), range(9, 2));
    const d = sum < 11 ? 11 - sum : dv11r(sum);
    return d === Number(ie[8]);
  },
  BA: (ie) => {
    if (ie.length !== 8 && ie.length !== 9) return false;
    const d = n(ie);
    const size = ie.length;
    const test = size === 8 ? d[0] : d[1];
    const mod10 = [0, 1, 2, 3, 4, 5, 8].includes(test);
    const calc = (sum: number) => (mod10 ? (10 - (sum % 10)) % 10 : dv11r(sum));
    const base = d.slice(0, size - 2);
    const dv2 = calc(weighted(base, range(size - 1, 2)));
    const dv1 = calc(weighted([...base, dv2], range(size, 2)));
    return dv1 === d[size - 2] && dv2 === d[size - 1];
  },
  CE: simple9(),
  DF: (ie) => {
    if (ie.length !== 13 || !ie.startsWith('07')) return false;
    const d = n(ie);
    return dv11(weighted(d, [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === d[11]
      && dv11(weighted(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === d[12];
  },
  ES: simple9(undefined, dv11r),
  GO: (ie) => {
    if (ie.length !== 9 || !/^(10|11|15|2\d)/.test(ie)) return false;
    const base = Number(ie.slice(0, 8));
    if (base === 11094402) return ie[8] === '0' || ie[8] === '1';
    const r = weighted(n(ie), range(9, 2)) % 11;
    let d: number;
    if (r === 0) d = 0;
    else if (r === 1) d = base >= 10103105 && base <= 10119997 ? 1 : 0;
    else d = 11 - r;
    return d === Number(ie[8]);
  },
  MA: simple9(/^12/, dv11r),
  MT: (raw) => {
    if (raw.length > 11 || raw.length < 9) return false;
    const ie = raw.padStart(11, '0');
    return dv11r(weighted(n(ie), [3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(ie[10]);
  },
  // MS: prefixo 28 (e 50, faixa liberada pela SEFAZ-MS)
  MS: simple9(/^(28|50)/, (sum) => { const r = sum % 11; if (r === 0) return 0; const t = 11 - r; return t > 9 ? 0 : t; }),
  MG: (ie) => {
    if (ie.length !== 13) return false;
    const d = n(ie);
    const withZero = [...d.slice(0, 3), 0, ...d.slice(3, 11)];
    const s1 = withZero.map((x, i) => x * (i % 2 === 0 ? 1 : 2)).join('').split('').reduce((a, c) => a + Number(c), 0);
    const dv1 = (10 - (s1 % 10)) % 10;
    const dv2 = dv11r(weighted([...d.slice(0, 11), dv1], [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
    return dv1 === d[11] && dv2 === d[12];
  },
  PA: simple9(/^15/, dv11r),
  PB: simple9(),
  PR: (ie) => {
    if (ie.length !== 10) return false;
    const d = n(ie);
    return dv11(weighted(d, [3, 2, 7, 6, 5, 4, 3, 2])) === d[8]
      && dv11(weighted(d, [4, 3, 2, 7, 6, 5, 4, 3, 2])) === d[9];
  },
  PE: (ie) => {
    const d = n(ie);
    if (ie.length === 9) {
      return dv11r(weighted(d, range(8, 2))) === d[7] && dv11r(weighted(d, range(9, 2))) === d[8];
    }
    if (ie.length === 14) { // formato antigo (CACEPE)
      let dv = 11 - (weighted(d, [5, 4, 3, 2, 1, 9, 8, 7, 6, 5, 4, 3, 2]) % 11);
      if (dv > 9) dv -= 10;
      return dv === d[13];
    }
    return false;
  },
  PI: simple9(),
  RJ: (ie) => ie.length === 8 && dv11r(weighted(n(ie), [2, 7, 6, 5, 4, 3, 2])) === Number(ie[7]),
  RN: (ie) => {
    if (!ie.startsWith('20') || (ie.length !== 9 && ie.length !== 10)) return false;
    const r = (weighted(n(ie), range(ie.length, 2)) * 10) % 11;
    return (r === 10 ? 0 : r) === Number(ie[ie.length - 1]);
  },
  RS: (ie) => ie.length === 10 && dv11(weighted(n(ie), [2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(ie[9]),
  RO: (ie) => {
    const d = n(ie);
    let dv: number;
    if (ie.length === 14) dv = 11 - (weighted(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11);
    else if (ie.length === 9) dv = 11 - (weighted(d.slice(3), [6, 5, 4, 3, 2]) % 11);
    else return false;
    if (dv >= 10) dv -= 10;
    return dv === d[d.length - 1];
  },
  RR: (ie) => ie.length === 9 && ie.startsWith('24') && weighted(n(ie), [1, 2, 3, 4, 5, 6, 7, 8]) % 9 === Number(ie[8]),
  SC: simple9(undefined, dv11r),
  SP: (ie) => {
    if (ie.length !== 12) return false;
    const d = n(ie);
    const dv1 = (weighted(d, [1, 3, 4, 5, 6, 7, 8, 10]) % 11) % 10;
    const dv2 = (weighted(d, [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2]) % 11) % 10;
    return dv1 === d[8] && dv2 === d[11];
  },
  SE: simple9(),
  TO: (ie) => {
    let base = ie;
    if (ie.length === 11) {
      if (!['01', '02', '03', '99'].includes(ie.slice(2, 4))) return false;
      base = ie.slice(0, 2) + ie.slice(4);
    } else if (ie.length !== 9) return false;
    const r = weighted(n(base), range(9, 2)) % 11;
    return (r < 2 ? 0 : 11 - r) === Number(base[8]);
  },
};

export const isUF = (v: string | null | undefined): v is UF => !!v && (UFS as readonly string[]).includes(v);

/** Normaliza o texto digitado (mantém só dígitos). "ISENTO" não é IE. */
export const normalizeIE = (v: string | null | undefined) => onlyDigits(v).slice(0, 14);

export function validateIE(uf: string | null | undefined, value: string | null | undefined): string | null {
  const ie = normalizeIE(value);
  if (!ie) return 'Informe a inscrição estadual.';
  if (!isUF(uf)) return 'Selecione a UF da inscrição.';
  if (/^0+$/.test(ie)) return 'Inscrição estadual inválida.';
  return VALIDATORS[uf](ie) ? null : `Inscrição estadual inválida para ${uf} (dígito verificador ou formato).`;
}

/** Máscara de exibição (MS: 28.123.456-7); demais UFs exibem os dígitos. */
export function formatIE(uf: string | null | undefined, value: string | null | undefined) {
  const ie = normalizeIE(value);
  if (uf === 'MS' && ie.length === 9) return `${ie.slice(0, 2)}.${ie.slice(2, 5)}.${ie.slice(5, 8)}-${ie.slice(8)}`;
  return ie;
}

/** Chave de identificação usada na deduplicação (a IE só é única dentro da UF). */
export const ieKey = (uf: string, ie: string) => `${uf.toUpperCase()}:${normalizeIE(ie)}`;

/**
 * Consulta oficial assistida: os portais públicos das SEFAZ exigem CAPTCHA e não
 * oferecem API aberta. O sistema abre a consulta oficial e copia a IE para colar.
 */
export const IE_LOOKUP_LINKS = [
  { label: 'SINTEGRA (todas as UFs)', url: 'http://www.sintegra.gov.br/' },
  { label: 'Cadastro Centralizado de Contribuintes (CCC)', url: 'https://dfe-portal.svrs.rs.gov.br/NFE/CCC' },
];
