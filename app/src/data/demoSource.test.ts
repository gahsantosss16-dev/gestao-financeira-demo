import { beforeEach, describe, expect, it } from 'vitest';
import { isValidCNPJ, isValidCPF } from '../lib/documents';
import { DemoSource } from './demoSource';
import { DEMO_USERS } from './demoSeed';

const T = '2026-10-24';
const as = (s: DemoSource, role: string) => { s.user = DEMO_USERS.find((u) => u.role === role)!; return s; };

describe('modo demonstração (espelho das regras do banco)', () => {
  let s: DemoSource;
  beforeEach(() => { s = as(new DemoSource(null, T), 'financeiro'); });

  it('gera dados fictícios coerentes', async () => {
    const parties = await s.list('parties');
    expect(parties.length).toBeGreaterThan(10);
    for (const p of parties) expect(p.person_type === 'PF' ? isValidCPF(p.document!) : isValidCNPJ(p.document!)).toBe(true);
    const services = await s.list('services');
    expect(services.every((x) => x.c_trib_mun === null && !x.tax_validated)).toBe(true);
    const rec = await s.list('receivables');
    const pays = await s.list('receivable_payments');
    for (const r of rec) {
      const paid = pays.filter((p) => p.receivable_id === r.id).reduce((a, p) => a + p.amount, 0);
      expect(r.paid_amount).toBeCloseTo(paid, 2);
    }
  });

  it('aplica permissões por perfil', async () => {
    as(s, 'consulta');
    await expect(s.insert('parties', { kind: 'cliente', person_type: 'PF', name: 'X' })).rejects.toThrow(/permissão/);
    await expect(s.list('audit_log')).rejects.toThrow(/permissão/);
    expect(await s.list('profiles')).toHaveLength(1);
    as(s, 'financeiro');
    await expect(s.insert('nfse_documents', {})).rejects.toThrow(/permissão/);
    const [r] = await s.list('receivables');
    await expect(s.remove('receivables', r.id)).rejects.toThrow(/permissão/);
  });

  it('impede CPF/CNPJ duplicado', async () => {
    await s.insert('parties', { kind: 'cliente', person_type: 'PJ', name: 'Nova', document: '11.222.333/0001-81' });
    await expect(s.insert('parties', { kind: 'cliente', person_type: 'PJ', name: 'Repetida', document: '11222333000181' })).rejects.toThrow(/duplicado/);
  });

  it('controla pagamentos parciais, excedentes e estorno', async () => {
    const [p] = await s.list('parties');
    const r = await s.insert('receivables', { party_id: p.id, description: 'Teste', due_date: T, issue_date: T, amount: 100, paid_amount: 50 });
    expect(r.paid_amount).toBe(0);
    const pay = await s.insert('receivable_payments', { receivable_id: r.id, paid_at: T, amount: 60, method: 'PIX' });
    expect((await s.list('receivables')).find((x) => x.id === r.id)!.paid_amount).toBe(60);
    await expect(s.insert('receivable_payments', { receivable_id: r.id, paid_at: T, amount: 41, method: 'PIX' })).rejects.toThrow(/excedem/);
    await expect(s.update('receivables', r.id, { paid_amount: 100 })).rejects.toThrow(/calculado/);
    await expect(s.update('receivables', r.id, { amount: 50 })).rejects.toThrow(/menor/);
    as(s, 'admin');
    await s.remove('receivable_payments', pay.id);
    expect((await s.list('receivables')).find((x) => x.id === r.id)!.paid_amount).toBe(0);
    const audit = await s.list('audit_log');
    expect(audit.some((a) => a.table_name === 'receivable_payments' && a.action === 'DELETE')).toBe(true);
  });

  it('bloqueia pagamento em conta cancelada e exclusão de cadastro vinculado', async () => {
    const [r] = await s.list('receivables');
    await s.update('receivables', r.id, { canceled_at: new Date().toISOString() });
    await expect(s.insert('receivable_payments', { receivable_id: r.id, paid_at: T, amount: 1, method: 'PIX' })).rejects.toThrow(/cancelada/);
    as(s, 'admin');
    await expect(s.remove('parties', r.party_id)).rejects.toThrow(/vinculados/);
  });

  it('protege dados tributários e status fiscais', async () => {
    const [srv] = await s.list('services');
    await expect(s.update('services', srv.id, { c_trib_mun: '123' })).rejects.toThrow(/Fiscal e Administrador/);
    await s.update('services', srv.id, { default_amount: 10 });
    as(s, 'fiscal');
    await expect(s.update('services', srv.id, { tax_validated: true })).rejects.toThrow(/cTribMun/);
    await s.update('services', srv.id, { c_trib_mun: 'COD', tax_validated: true, tax_validated_by: 'Contabilidade' });
    await expect(s.update('services', srv.id, { c_trib_mun: 'OUTRO' })).rejects.toThrow(/nova validação/);
    const [party] = await s.list('parties');
    const doc = await s.insert('nfse_documents', { party_id: party.id, service_id: srv.id, amount: 10, description: 'x', competence_date: T, c_trib_mun: 'COD' });
    expect(doc.status).toBe('rascunho');
    await expect(s.update('nfse_documents', doc.id, { status: 'autorizada' })).rejects.toThrow(/backend/);
    await expect(s.update('nfse_documents', doc.id, { chave_acesso: '1' })).rejects.toThrow(/backend/);
    await expect(s.insert('nfse_documents', { environment: 'producao', party_id: party.id, service_id: srv.id, amount: 1, description: 'x', competence_date: T, c_trib_mun: 'COD' })).rejects.toThrow(/produção/);
  });

  it('não simula emissão: registra a solicitação como não habilitada', async () => {
    as(s, 'fiscal');
    const res = await s.callFiscal('emitir', { environment: 'homologacao', documentId: 'x' });
    expect(res.status).toBe('nao_habilitado');
    const [log] = await s.list('nfse_requests');
    expect(log).toMatchObject({ operation: 'emitir', environment: 'homologacao', url: 'https://nfse2-cgr.dsfweb.com.br/notafiscal-ws/nfse' });
    as(s, 'financeiro');
    expect((await s.callFiscal('emitir', { environment: 'homologacao' })).status).toBe('erro');
  });

  it('impede gerar a mesma recorrência duas vezes', async () => {
    const parent = (await s.list('payables')).find((p) => p.recurrence_parent_id)!;
    await expect(s.insert('payables', { description: 'dup', amount: 1, due_date: parent.due_date, recurrence: 'mensal', recurrence_parent_id: parent.recurrence_parent_id })).rejects.toThrow(/duplicado/);
  });
});
