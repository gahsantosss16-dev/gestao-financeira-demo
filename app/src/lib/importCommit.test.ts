import { describe, expect, it } from 'vitest';
import { DemoSource } from '../data/demoSource';
import { DEMO_USERS } from '../data/demoSeed';
import { analyzeRows, autoMap, parseRow, type ImportOptions } from './importer';
import { commitImport } from './importCommit';

const T = '2026-10-24';
const OPTS: ImportOptions = { defaultUf: 'MS', source: 'Planilha do Estado', createParties: true, updateMode: 'preencher', generateReceivables: true, generateCharges: true, defaultDescription: 'Contribuição', defaultReference: '2026-10' };
const headers = ['Inscrição Estadual', 'Nome', 'CPF', 'Valor', 'Vencimento', 'Propriedade'];
const mapping = autoMap(headers);
const sheet = [
  ['287654320', 'Produtor Importado', '', '120,00', '10/11/2026', 'Fazenda Planilha'],
  ['287654320', 'Produtor Importado', '', '35,00', '10/11/2026', 'Fazenda Planilha'],   // mesmo produtor, outra linha de cobrança (valor diferente)
  ['281112223', 'Outro Importado', '', '80,00', '10/11/2026', ''],
  ['283123452', 'IE Inválida', '', '10,00', '10/11/2026', ''],
];

async function run(source: DemoSource, decisions = {}) {
  const [parties, registrations, receivables] = await Promise.all([source.list('parties'), source.list('party_registrations'), source.list('receivables')]);
  const rows = analyzeRows(sheet.map((c, i) => parseRow(c, headers, mapping, i + 2, OPTS)), { parties, registrations, receivables }, OPTS);
  return commitImport(source, { fileName: 'estado-out.xlsx', sha256: 'a'.repeat(64), sheetName: 'Planilha1', mapping: { ie: 'Inscrição Estadual' }, options: OPTS, rows, decisions, approvedChanges: {}, categoryId: null, today: T });
}

describe('gravação da importação', () => {
  it('cria cadastros, inscrições, contas e cobranças, registrando a origem de cada linha', async () => {
    const s = new DemoSource(null, T);
    s.user = DEMO_USERS.find((u) => u.role === 'financeiro')!;
    const batch = await run(s);
    expect(batch).toMatchObject({ status: 'concluida_com_erros', created_count: 2, receivables_created: 3, charges_created: 3, error_count: 1 });
    const parties = await s.list('parties');
    const imported = parties.filter((p) => p.name === 'Produtor Importado');
    expect(imported).toHaveLength(1); // duas linhas do mesmo produtor não duplicam o cadastro
    expect(imported[0].rural_producer).toBe(true);
    const regs = (await s.list('party_registrations')).filter((r) => r.party_id === imported[0].id);
    expect(regs).toMatchObject([{ uf: 'MS', ie: '287654320', property_name: 'Fazenda Planilha', is_primary: true }]);
    const recs = (await s.list('receivables')).filter((r) => r.import_batch_id === batch.id);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toMatchObject({ import_row_number: 2, description: 'Contribuição 10/2026', registration_id: regs[0].id });
    const rows = (await s.list('import_rows')).filter((r) => r.batch_id === batch.id);
    expect(rows.map((r) => r.status)).toEqual(['cadastro_criado', 'vinculado', 'cadastro_criado', 'erro']);
    expect(rows[3].message).toMatch(/inválida para MS/);
    expect(rows[0].raw).toMatchObject({ 'Inscrição Estadual': '287654320' });
  });

  it('reimportar a mesma planilha não duplica cadastros, contas nem cobranças', async () => {
    const s = new DemoSource(null, T);
    s.user = DEMO_USERS.find((u) => u.role === 'financeiro')!;
    await run(s);
    const before = { parties: (await s.list('parties')).length, recs: (await s.list('receivables')).length, charges: (await s.list('charges')).length };
    const second = await run(s);
    expect(second).toMatchObject({ created_count: 0, receivables_created: 0, charges_created: 0 });
    expect((await s.list('parties')).length).toBe(before.parties);
    expect((await s.list('receivables')).length).toBe(before.recs);
    expect((await s.list('charges')).length).toBe(before.charges);
    const statuses = (await s.list('import_rows')).filter((r) => r.batch_id === second.id).map((r) => r.status);
    expect(statuses.slice(0, 3)).toEqual(['duplicado', 'duplicado', 'duplicado']);
  });

  it('perfil consulta não importa', async () => {
    const s = new DemoSource(null, T);
    s.user = DEMO_USERS.find((u) => u.role === 'consulta')!;
    await expect(run(s)).rejects.toThrow(/permissão/);
  });
});
