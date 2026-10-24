import { describe, expect, it } from 'vitest';
import { formatDocument, isValidCNPJ, isValidCPF, validateDocument } from './documents';

describe('CPF/CNPJ', () => {
  it('valida CPF', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('529.982.247-24')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
  });
  it('valida CNPJ', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-80')).toBe(false);
    expect(isValidCNPJ('00000000000000')).toBe(false);
  });
  it('formata e valida pelo tipo de pessoa', () => {
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(validateDocument('PF', '11222333000181')).toBe('CPF inválido');
    expect(validateDocument('PJ', '11222333000181')).toBeNull();
    expect(validateDocument('PJ', '')).toBeNull();
  });
});
