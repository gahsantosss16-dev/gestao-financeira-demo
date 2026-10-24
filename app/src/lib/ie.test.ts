import { describe, expect, it } from 'vitest';
import { formatIE, ieKey, normalizeIE, validateIE } from './ie';

// Exemplos do roteiro de crítica de IE do SINTEGRA (inscrições ilustrativas);
// o de MS (28.312.345-1) foi calculado pelo algoritmo oficial da SEFAZ-MS.
const VALID: [string, string][] = [
  ['AC', '0100482300112'], ['AL', '240000048'], ['AP', '030123459'], ['AM', '999999990'],
  ['BA', '12345663'], ['BA', '100000306'], ['CE', '060000015'], ['DF', '0730000100109'],
  ['ES', '999999990'], ['GO', '109876547'], ['MA', '120000385'], ['MT', '00130000019'],
  ['MS', '283123451'], ['MG', '0623079040081'], ['PA', '159999995'], ['PB', '060000015'],
  ['PR', '1234567850'], ['PE', '032141840'], ['PE', '18100100000049'], ['PI', '012345679'],
  ['RJ', '99999993'], ['RN', '200400401'], ['RS', '2243658792'], ['RO', '00000000625213'],
  ['RO', '101625213'], ['RR', '240066281'], ['SC', '251040852'], ['SP', '110042490114'],
  ['SE', '271234563'], ['TO', '29010227836'],
];

describe('inscrição estadual', () => {
  it.each(VALID)('aceita IE válida de %s (%s)', (uf, ie) => {
    expect(validateIE(uf, ie)).toBeNull();
  });

  it.each(VALID)('recusa IE de %s com dígito verificador alterado (%s)', (uf, ie) => {
    const last = Number(ie.at(-1));
    const altered = ie.slice(0, -1) + String((last + 1) % 10);
    expect(validateIE(uf, altered)).not.toBeNull();
  });

  it('não aceita a IE de uma UF em outra', () => {
    expect(validateIE('SP', '283123451')).not.toBeNull();
    expect(validateIE('MS', '110042490114')).not.toBeNull();
  });

  it('exige UF e IE e normaliza a digitação', () => {
    expect(validateIE('', '283123459')).toMatch(/UF/);
    expect(validateIE('MS', '')).toMatch(/Informe/);
    expect(validateIE('MS', 'ISENTO')).toMatch(/Informe/);
    expect(validateIE('MS', '000000000')).toMatch(/inválida/);
    expect(normalizeIE('28.312.345-1')).toBe('283123451');
    expect(validateIE('MS', '28.312.345-1')).toBeNull();
    expect(formatIE('MS', '283123451')).toBe('28.312.345-1');
    expect(ieKey('ms', '28.312.345-9')).toBe('MS:283123459');
  });
});
