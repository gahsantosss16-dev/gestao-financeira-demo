import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Party, PartyRegistration } from './types';
import { analyzeRows, autoMap, buildImportKey, detectHeaderRow, errorsCsv, parseAmount, parseCsv, parseDate, parseReference, parseRow, readSpreadsheet, summarize, type ImportOptions } from './importer';

const OPTS: ImportOptions = { defaultUf: 'MS', source: 'Planilha do Estado', createParties: true, updateMode: 'preencher', generateReceivables: true, generateCharges: false, defaultDescription: 'Contribuição', defaultReference: null };
const party = (o: Partial<Party>): Party => ({
  id: 'p1', kind: 'cliente', person_type: 'PF', name: 'Produtor Existente', trade_name: null, document: '52998224725', state_registration: null,
  municipal_registration: null, email: null, phone: null, contact_name: null, cep: null, street: null, number: null, complement: null,
  district: null, city: 'Campo Grande', uf: 'MS', city_ibge_code: null, notes: null, active: true, rural_producer: true, ...o,
});
const reg = (o: Partial<PartyRegistration>): PartyRegistration => ({ id: 'r1', party_id: 'p1', uf: 'MS', ie: '283123451', property_name: null, city: null, city_ibge_code: null, status: null, checked_at: null, is_primary: true, active: true, notes: null, ...o });

describe('leitura de arquivos', () => {
  it('lê CSV com ponto e vírgula, aspas e BOM', () => {
    const rows = parseCsv('﻿Nome;IE;Valor\r\n"Silva; João";28.312.345-1;"1.234,56"\r\n\r\n');
    expect(rows).toEqual([['Nome', 'IE', 'Valor'], ['Silva; João', '28.312.345-1', '1.234,56']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('lê planilha Excel (.xlsx) com datas e números', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Outubro');
    ws.addRow(['Relatório mensal']);
    ws.addRow(['Inscrição Estadual', 'Nome do Produtor', 'CPF/CNPJ', 'Valor', 'Vencimento']);
    ws.addRow(['283123451', 'Fulano de Tal', '529.982.247-25', 150.5, new Date(Date.UTC(2026, 10, 10))]);
    const buffer = await wb.xlsx.writeBuffer();
    const [sheet] = await readSpreadsheet('estado.xlsx', buffer as ArrayBuffer);
    expect(sheet.name).toBe('Outubro');
    expect(detectHeaderRow(sheet.rows)).toBe(1);
    expect(sheet.rows[2]).toEqual(['283123451', 'Fulano de Tal', '529.982.247-25', '150.5', '2026-11-10']);
  });

  it('recusa formatos não suportados', async () => {
    await expect(readSpreadsheet('antigo.xls', new ArrayBuffer(0))).rejects.toThrow(/\.xlsx/);
  });
});

describe('mapeamento e conversões', () => {
  it('sugere colunas por sinônimos, sem acentos/caixa', () => {
    const m = autoMap(['Insc. Estadual', 'NOME DO PRODUTOR', 'CPF', 'Município', 'Valor (R$)', 'Data de Vencimento', 'Competência', 'Histórico']);
    expect(m).toMatchObject({ ie: 0, name: 1, document: 2, city: 3, amount: 4, due_date: 5, reference: 6, description: 7 });
  });
  it('converte valores, datas e competências em formatos brasileiros', () => {
    expect(parseAmount('R$ 1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('150.5')).toBe(150.5);
    expect(parseAmount('abc')).toBeNull();
    expect(parseDate('10/11/2026')).toBe('2026-11-10');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('46336')).toBe('2026-11-10');
    expect(parseReference('10/2026')).toBe('2026-10');
    expect(parseReference('Out/2026')).toBe('2026-10');
    expect(parseReference('2026-10-15')).toBe('2026-10');
  });
});

describe('análise da prévia (nada é gravado)', () => {
  const headers = ['IE', 'Nome', 'CPF/CNPJ', 'Valor', 'Vencimento', 'E-mail'];
  const mapping = autoMap(headers);
  const rowOf = (cells: string[], n = 2) => parseRow(cells, headers, mapping, n, OPTS);
  const existing = { parties: [party({})], registrations: [reg({})], receivables: [] as { import_key: string | null }[] };

  it('associa pela IE (UF + IE) e completa somente campos vazios', () => {
    const [a] = analyzeRows([rowOf(['28.312.345-1', 'Produtor Existente', '', '100,00', '10/11/2026', 'novo@exemplo.com'])], existing, OPTS);
    expect(a.cls).toBe('vinculado');
    expect(a.partyId).toBe('p1');
    expect(a.updates).toEqual({ email: 'novo@exemplo.com' });
    expect(a.financial).toBe(true);
  });

  it('associa pelo CPF quando a IE é nova (mesmo produtor, outra propriedade)', () => {
    const [a] = analyzeRows([rowOf(['281112223', 'Produtor Existente', '529.982.247-25', '', '', ''])], existing, { ...OPTS, generateReceivables: false });
    expect(a.partyId).toBe('p1');
    expect(a.newRegistration).toBe(true);
    expect(a.cls).toBe('vinculado');
  });

  it('não sobrescreve dados existentes com vazio e registra divergências no modo "preencher"', () => {
    const ex = { ...existing, parties: [party({ email: 'antigo@exemplo.com' })] };
    const [a] = analyzeRows([rowOf(['283123451', 'Produtor Existente', '', '', '', 'outro@exemplo.com'])], ex, { ...OPTS, generateReceivables: false });
    expect(a.updates).toEqual({});
    expect(a.divergences[0]).toMatch(/antigo@exemplo.com/);
    const [b] = analyzeRows([rowOf(['283123451', 'Produtor Existente', '', '', '', ''])], ex, { ...OPTS, generateReceivables: false });
    expect(b.updates).toEqual({});
    const [c] = analyzeRows([rowOf(['283123451', 'Produtor Existente', '', '', '', 'outro@exemplo.com'])], ex, { ...OPTS, generateReceivables: false, updateMode: 'atualizar' });
    expect(c.updates).toEqual({ email: 'outro@exemplo.com' });
  });

  it('pede confirmação quando só o nome coincide ou quando IE e CPF apontam para cadastros diferentes', () => {
    const [byName] = analyzeRows([rowOf(['', 'Produtor Existente', '', '', '', ''])], existing, { ...OPTS, generateReceivables: false });
    expect(byName.cls).toBe('revisar');
    expect(byName.candidates[0].partyId).toBe('p1');
    const ex = { ...existing, parties: [party({}), party({ id: 'p2', name: 'Outra Pessoa', document: '11222333000181', person_type: 'PJ' })] };
    const [conflict] = analyzeRows([rowOf(['283123451', 'X', '11.222.333/0001-81', '', '', ''])], ex, { ...OPTS, generateReceivables: false });
    expect(conflict.cls).toBe('revisar');
    expect(conflict.candidates.map((c) => c.partyId).sort()).toEqual(['p1', 'p2']);
  });

  it('classifica novos cadastros e erros de validação', () => {
    const [novo, ieInv, semDados, semValor] = analyzeRows([
      rowOf(['287654320', 'Produtor Novo', '', '50,00', '10/11/2026', ''], 2),
      rowOf(['283123452', 'Produtor IE Errada', '', '', '', ''], 3),
      rowOf(['', '', '', '', '', ''], 4),
      rowOf(['281112223', 'Sem Valor', '', '', '10/11/2026', ''], 5),
    ], existing, OPTS);
    expect(novo.cls).toBe('novo');
    expect(ieInv.cls).toBe('erro');
    expect(ieInv.errors[0]).toMatch(/inválida para MS/);
    expect(semDados.cls).toBe('erro');
    expect(semValor.cls).toBe('erro');
    expect(semValor.errors.join()).toMatch(/Valor/);
  });

  it('reimportação e linhas repetidas não duplicam lançamentos', () => {
    const cells = ['283123451', 'Produtor Existente', '', '100,00', '10/11/2026', ''];
    const first = analyzeRows([rowOf(cells, 2), rowOf(cells, 3)], existing, OPTS);
    expect(first[0].financial).toBe(true);
    expect(first[1].financial).toBe(false);
    expect(first[1].warnings.join()).toMatch(/linha 2/);
    const key = first[0].importKey!;
    const again = analyzeRows([rowOf(cells, 2)], { ...existing, receivables: [{ import_key: key }] }, OPTS);
    expect(again[0].financial).toBe(false);
    expect(again[0].cls).toBe('duplicado');
    expect(buildImportKey('Planilha do Estado', { uf: 'MS', ie: '283123451', document: '', reference: null, due_date: '2026-11-10', document_number: '', description: '', amount: 100 }, 'Contribuição')).toBe(key);
  });

  it('resume a prévia e gera o relatório de erros em CSV', () => {
    const rows = analyzeRows([rowOf(['283123451', 'Produtor Existente', '', '100,00', '10/11/2026', '']), rowOf(['283123452', 'Erro', '', '', '', ''], 3)], existing, OPTS);
    expect(summarize(rows)).toMatchObject({ total: 2, vinculado: 1, erro: 1, financial: 1, amount: 100 });
    const csv = errorsCsv(rows.filter((r) => r.cls === 'erro'));
    expect(csv).toContain('"3";"erro"');
    expect(csv).toContain('inválida para MS');
  });
});
