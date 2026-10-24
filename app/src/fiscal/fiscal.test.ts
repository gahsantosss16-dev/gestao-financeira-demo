import { describe, expect, it } from 'vitest';
import { buildNfseRequest, NFSE_BASE_URL, resolveEnvironment } from '../../../supabase/functions/_shared/nfseEndpoints';
import { hasBlockingIssues, validateDpsDraft } from '../../../supabase/functions/_shared/dpsValidation';

describe('endpoints da NFS-e de Campo Grande/MS', () => {
  it('usa as URLs oficiais de homologação e produção', () => {
    expect(NFSE_BASE_URL.homologacao).toBe('https://nfse2-cgr.dsfweb.com.br');
    expect(NFSE_BASE_URL.producao).toBe('https://nfseapi.campogrande.ms.gov.br');
  });
  it('monta os quatro endpoints documentados', () => {
    expect(buildNfseRequest('homologacao', 'emitir')).toEqual({ operation: 'emitir', method: 'POST', url: 'https://nfse2-cgr.dsfweb.com.br/notafiscal-ws/nfse' });
    expect(buildNfseRequest('homologacao', 'evento', { chaveAcesso: 'ABC123' }).url).toBe('https://nfse2-cgr.dsfweb.com.br/notafiscal-ws/nfse/ABC123/eventos');
    expect(buildNfseRequest('homologacao', 'consultar_nfse', { chaveAcesso: 'ABC123' })).toMatchObject({ method: 'GET', url: 'https://nfse2-cgr.dsfweb.com.br/notafiscal-ws/nfse/ABC123' });
    expect(buildNfseRequest('producao', 'consultar_dps', { dpsId: 'DPS1' }).url).toBe('https://nfseapi.campogrande.ms.gov.br/notafiscal-ws/nfse/dps/DPS1');
  });
  it('rejeita identificadores que poderiam alterar a URL', () => {
    expect(() => buildNfseRequest('homologacao', 'consultar_nfse', { chaveAcesso: '../admin' })).toThrow();
    expect(() => buildNfseRequest('homologacao', 'consultar_dps', {})).toThrow();
  });
  it('bloqueia produção salvo liberação explícita', () => {
    expect(resolveEnvironment(undefined, false)).toBe('homologacao');
    expect(() => resolveEnvironment('producao', false)).toThrow(/não liberado/);
    expect(resolveEnvironment('producao', true)).toBe('producao');
    expect(() => resolveEnvironment('qualquer', true)).toThrow();
  });
});

describe('pré-validação da DPS', () => {
  const issuer = { cnpj: '11222333000181', legal_name: 'Emitente', municipal_registration: '123', city_ibge_code: '1234567', certificate_type: 'A1', certificate_valid_until: '2027-01-01', dps_series: '1' };
  const draft = { amount: 100, competence_date: '2026-10-24', description: 'Serviço' };
  const service = { name: 'S', c_trib_mun: 'CODIGO', tax_validated: true };
  const taker = { name: 'T', document: '52998224725' };

  it('aceita uma DPS com todos os dados obrigatórios', () => {
    expect(validateDpsDraft(draft, issuer, service, taker, '2026-10-24')).toEqual([]);
  });
  it('exige cTribMun validado pela contabilidade', () => {
    const issues = validateDpsDraft(draft, issuer, { name: 'S', c_trib_mun: null, tax_validated: false }, taker, '2026-10-24');
    expect(issues.map((i) => i.field)).toEqual(['servico.cTribMun', 'servico.validacao']);
    expect(hasBlockingIssues(issues)).toBe(true);
  });
  it('exige certificado confirmado e dentro da validade', () => {
    expect(validateDpsDraft(draft, { ...issuer, certificate_type: 'a_confirmar' }, service, taker, '2026-10-24')[0].field).toBe('certificado');
    expect(validateDpsDraft(draft, { ...issuer, certificate_valid_until: '2026-01-01' }, service, taker, '2026-10-24')[0].message).toMatch(/vencido/);
  });
  it('exige dados do emitente e do tomador', () => {
    const issues = validateDpsDraft(draft, null, service, { name: 'T', document: null }, '2026-10-24');
    expect(issues.map((i) => i.field)).toEqual(['emitente', 'tomador.documento']);
  });
});
