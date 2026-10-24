import { describe, expect, it, vi } from 'vitest';
import { cnpjRoot, formatDocumentProgressive, formatPhone } from './documents';
import { lookupCep, lookupCnpj } from './lookups';

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('máscaras progressivas (LSB)', () => {
  it('formata enquanto digita', () => {
    expect(formatDocumentProgressive('5299822')).toBe('529.982.2');
    expect(formatDocumentProgressive('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocumentProgressive('112223', 'PJ')).toBe('11.222.3');
    expect(formatPhone('67999991234')).toBe('(67) 99999-1234');
    expect(cnpjRoot('11.222.333/0002-62')).toBe('11222333');
  });
});

describe('consulta de CNPJ', () => {
  it('preenche dados da BrasilAPI e as IEs informadas pela base pública', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('brasilapi')
      ? json(200, { razao_social: 'EMPRESA EXEMPLO LTDA', nome_fantasia: 'EXEMPLO', cep: '79000-000', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '10', bairro: 'CENTRO', municipio: 'CAMPO GRANDE', uf: 'MS', ddd_telefone_1: '6733334444', email: null, codigo_municipio_ibge: 5002704, descricao_situacao_cadastral: 'ATIVA' })
      : json(200, { estabelecimento: { cnpj: '11222333000181', email: 'contato@exemplo.com', inscricoes_estaduais: [{ inscricao_estadual: '28.312.345-1', ativo: true, estado: { sigla: 'MS' } }] } }));
    const r = await lookupCnpj('11.222.333/0001-81', fetcher as unknown as typeof fetch);
    expect(r).toMatchObject({ legalName: 'EMPRESA EXEMPLO LTDA', street: 'RUA DAS FLORES', city: 'CAMPO GRANDE', uf: 'MS', email: 'contato@exemplo.com', cityIbgeCode: '5002704', situation: 'ATIVA' });
    expect(r.stateRegistrations).toEqual([{ uf: 'MS', ie: '283123451', active: true }]);
  });
  it('mantém os dados principais se a base complementar falhar', async () => {
    const fetcher = vi.fn(async (url: string) => { if (url.includes('cnpj.ws')) throw new Error('rede'); return json(200, { razao_social: 'X', email: 'a@b.com' }); });
    const r = await lookupCnpj('11222333000181', fetcher as unknown as typeof fetch);
    expect(r.legalName).toBe('X');
    expect(r.stateRegistrations).toEqual([]);
  });
  it('traduz erros do serviço', async () => {
    await expect(lookupCnpj('123', vi.fn() as unknown as typeof fetch)).rejects.toThrow(/14 números/);
    await expect(lookupCnpj('11222333000181', (async () => json(404, {})) as unknown as typeof fetch)).rejects.toThrow(/não encontrado/);
    await expect(lookupCnpj('11222333000181', (async () => json(429, {})) as unknown as typeof fetch)).rejects.toThrow(/Limite/);
    await expect(lookupCnpj('11222333000181', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).rejects.toThrow(/manualmente/);
  });
});

describe('consulta de CEP', () => {
  it('usa ViaCEP e recorre à BrasilAPI', async () => {
    const via = vi.fn(async () => json(200, { logradouro: 'Rua A', bairro: 'Centro', localidade: 'Campo Grande', uf: 'MS', ibge: '5002704' }));
    expect(await lookupCep('79000-000', via as unknown as typeof fetch)).toMatchObject({ city: 'Campo Grande', cityIbgeCode: '5002704' });
    const fallback = vi.fn(async (url: string) => url.includes('viacep') ? json(200, { erro: true }) : json(200, { city: 'Dourados', state: 'ms' }));
    expect(await lookupCep('79800000', fallback as unknown as typeof fetch)).toMatchObject({ city: 'Dourados', uf: 'MS' });
    expect(await lookupCep('123', via as unknown as typeof fetch)).toBeNull();
  });
});
