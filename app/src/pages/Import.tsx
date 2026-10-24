import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { TextInput } from '../components/TextInput';
import { Badge, Callout, Empty, Field, Loading, PageHead, SchemaPending } from '../components/ui';
import { useMutation, useSchemaV2, useSchemaVersion, useTable } from '../data/DataContext';
import { formatDocument } from '../lib/documents';
import { brl, fdate, fdatetime, today } from '../lib/format';
import { formatIE, UFS } from '../lib/ie';
import { analyzeRows, autoMap, detectHeaderRow, errorsCsv, FIELD_DEFS, headerSignature, parseRow, readFileBuffer, readSpreadsheet, sha256Hex, summarize, type AnalyzedRow, type ColumnMapping, type ImportField, type ImportOptions, type RowClass, type SheetData } from '../lib/importer';
import { commitImport, type RowDecision } from '../lib/importCommit';
import { can } from '../lib/permissions';
import type { ImportBatch } from '../lib/types';

const CLASS_META: Record<RowClass, { label: string; tone: string; help: string }> = {
  novo: { label: 'Novo cadastro', tone: 'primary', help: 'Produtor não encontrado; será cadastrado' },
  vinculado: { label: 'Cadastro encontrado', tone: 'success', help: 'Associado pela IE ou CPF/CNPJ' },
  revisar: { label: 'Revisar', tone: 'warning', help: 'Associação ambígua: confirme antes de gravar' },
  duplicado: { label: 'Já importado', tone: 'muted', help: 'Nada novo a gravar' },
  erro: { label: 'Erro', tone: 'danger', help: 'Não será importado' },
};
const BATCH_STATUS: Record<ImportBatch['status'], { label: string; tone: string }> = {
  processando: { label: 'Em processamento', tone: 'info' }, concluida: { label: 'Concluída', tone: 'success' },
  concluida_com_erros: { label: 'Concluída com erros', tone: 'warning' }, interrompida: { label: 'Interrompida', tone: 'danger' },
};
const MAPPING_KEY = 'associapec-import-mappings';
const loadSavedMapping = (sig: string): ColumnMapping | null => { try { return JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}')[sig] ?? null; } catch { return null; } };
const saveMapping = (sig: string, m: ColumnMapping) => { try { const all = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}'); all[sig] = m; localStorage.setItem(MAPPING_KEY, JSON.stringify(all)); } catch { /* conveniência local */ } };

function downloadText(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportPage() {
  const schema = useSchemaVersion();
  const v2 = useSchemaV2();
  if (schema === null) return <Loading />;
  if (!v2) return <><PageHead title="Importar planilhas" subtitle="Importação das planilhas mensais (Excel/CSV)" /><SchemaPending feature="A importação de planilhas" /></>;
  return <Importer />;
}

type Step = 'arquivo' | 'mapeamento' | 'previa' | 'gravando' | 'resultado';

function Importer() {
  const { profile } = useAuth();
  // mesmo importador; aberto a partir de Clientes e fornecedores com foco cadastral
  const [params] = useSearchParams();
  const cadastral = params.get('foco') === 'cadastro';
  const { confirm, toast } = useFeedback();
  const parties = useTable('parties');
  const regs = useTable('party_registrations');
  const receivables = useTable('receivables');
  const categories = useTable('categories');
  const batches = useTable('import_batches');
  const { run } = useMutation();
  const writable = can(profile?.role, 'write', 'import_batches');

  const [tab, setTab] = useState<'importar' | 'historico'>('importar');
  const [step, setStep] = useState<Step>('arquivo');
  const [file, setFile] = useState<{ name: string; sha: string; sheets: SheetData[] } | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ defaultUf: 'MS', source: 'Planilha mensal do Estado', createParties: true, updateMode: 'preencher', generateReceivables: !cadastral, generateCharges: false, defaultDescription: 'Contribuição', defaultReference: today().slice(0, 7) });
  const [categoryId, setCategoryId] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzedRow[]>([]);
  const [decisions, setDecisions] = useState<Record<number, RowDecision>>({});
  // conferência das diferenças: campos aprovados por linha (nada é atualizado sem aprovação)
  const [approved, setApproved] = useState<Record<number, string[]>>({});
  const [filter, setFilter] = useState<RowClass | ''>('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportBatch | null>(null);
  const [reading, setReading] = useState(false);
  const [batchDetail, setBatchDetail] = useState<ImportBatch | null>(null);

  const sheet = file?.sheets[sheetIdx];
  const headers = useMemo(() => (sheet ? sheet.rows[headerRow] ?? [] : []), [sheet, headerRow]);
  const dataRows = useMemo(() => (sheet ? sheet.rows.slice(headerRow + 1) : []), [sheet, headerRow]);
  const previousImport = file ? batches.rows.find((b) => b.file_sha256 === file.sha) : undefined;

  const onFile = async (f: File) => {
    if (f.size > 15 * 1024 * 1024) { toast('Arquivo maior que 15 MB.', 'error'); return; }
    setReading(true);
    try {
      const buffer = await readFileBuffer(f);
      const [sheets, sha] = await Promise.all([readSpreadsheet(f.name, buffer), sha256Hex(buffer)]);
      if (!sheets.length) throw new Error('A planilha não tem linhas com dados.');
      setFile({ name: f.name, sha, sheets });
      selectSheet(sheets, 0);
      setStep('mapeamento');
    } catch (e) {
      toast(`Não foi possível ler o arquivo: ${(e as Error).message}`, 'error');
    } finally {
      setReading(false);
    }
  };
  const selectSheet = (sheets: SheetData[], idx: number) => {
    setSheetIdx(idx);
    const h = detectHeaderRow(sheets[idx].rows);
    setHeaderRow(h);
    const hdr = sheets[idx].rows[h] ?? [];
    setMapping(loadSavedMapping(headerSignature(hdr)) ?? autoMap(hdr));
  };

  const hasIdentity = mapping.ie !== undefined || mapping.document !== undefined || mapping.name !== undefined;
  const hasFinancial = mapping.amount !== undefined || mapping.due_date !== undefined;

  const analyze = () => {
    if (!hasIdentity) { toast('Associe ao menos uma coluna de identificação (IE, CPF/CNPJ ou nome).', 'error'); return; }
    saveMapping(headerSignature(headers), mapping);
    const parsed = dataRows.map((cells, i) => parseRow(cells, headers, mapping, headerRow + i + 2, opts));
    const effective = { ...opts, generateReceivables: opts.generateReceivables && hasFinancial, generateCharges: opts.generateCharges && opts.generateReceivables && hasFinancial };
    setOpts(effective);
    setAnalysis(analyzeRows(parsed, { parties: parties.rows, registrations: regs.rows, receivables: receivables.rows }, effective));
    setDecisions({});
    setApproved({});
    setFilter('');
    setStep('previa');
  };

  const summary = summarize(analysis);
  const pendingReview = analysis.filter((r) => r.cls === 'revisar' && !decisions[r.rowNumber]).length;
  const changeRows = analysis.filter((r) => r.cls !== 'erro' && r.changes.length > 0);
  const totalChanges = changeRows.reduce((a, r) => a + r.changes.length, 0);
  const approvedCount = Object.values(approved).reduce((a, f) => a + f.length, 0);
  const toggleChange = (row: number, field: string) => setApproved((cur) => {
    const set = new Set(cur[row] ?? []);
    if (set.has(field)) set.delete(field); else set.add(field);
    return { ...cur, [row]: [...set] };
  });
  const approveAll = (kind?: 'preencher') => setApproved(Object.fromEntries(changeRows.map((r) => [r.rowNumber, r.changes.filter((c) => !kind || c.kind === kind).map((c) => c.field as string)])));

  const commit = async () => {
    if (!file || !sheet) return;
    const toWrite = analysis.filter((r) => r.cls !== 'erro').length;
    if (!(await confirm({
      title: 'Confirmar importação?',
      message: <>
        Serão processadas <b>{analysis.length}</b> linhas de <b>{file.name}</b>:<br />
        {summary.novo} novo(s) cadastro(s), {summary.vinculado} associado(s), {summary.financial} conta(s) a receber ({brl(summary.amount)}){opts.generateCharges ? ' com cobranças' : ''}.<br />
        {summary.erro > 0 && <>{summary.erro} linha(s) com erro não serão importadas. </>}
        {pendingReview > 0 && <>{pendingReview} linha(s) em revisão sem confirmação serão ignoradas. </>}
        {totalChanges > 0 && <>{approvedCount} de {totalChanges} alteração(ões) de cadastro aprovada(s); as demais serão mantidas como estão. </>}
        Dados existentes não são apagados.
      </>,
      confirmLabel: `Importar ${toWrite} linha(s)`,
    }))) return;
    setStep('gravando');
    setProgress({ done: 0, total: analysis.length });
    const mappingByHeader = Object.fromEntries(Object.entries(mapping).map(([f, i]) => [f, headers[i as number] ?? `Coluna ${(i as number) + 1}`]));
    const batch = await run((s) => commitImport(s, {
      fileName: file.name, sha256: file.sha, sheetName: sheet.name, mapping: mappingByHeader, options: opts, rows: analysis, decisions, approvedChanges: approved,
      categoryId: categoryId || null, today: today(), onProgress: (done, total) => setProgress({ done, total }),
    }), 'Importação concluída.');
    if (batch) { setResult(batch); setStep('resultado'); }
    else setStep('previa');
  };

  const reset = () => { setFile(null); setAnalysis([]); setResult(null); setStep('arquivo'); };
  const partyName = (id: string) => parties.rows.find((p) => p.id === id)?.name ?? '—';

  return (
    <>
      <PageHead title={cadastral ? 'Importar clientes' : 'Importar planilhas'}
        subtitle={cadastral
          ? 'Foco cadastral: identifica produtores por IE e CPF/CNPJ e prepara cadastros. É o mesmo importador da planilha mensal — os lançamentos podem ser ativados nas opções.'
          : 'Planilhas mensais (Excel/CSV): identifica produtores por IE e CPF/CNPJ, atualiza cadastros após conferência e gera contas e cobranças sem duplicar'}
        actions={cadastral ? <Link className="btn" to="/cadastros/pessoas"><Icon name="users" />Voltar a Clientes e fornecedores</Link> : <Link className="btn" to="/cadastros/pessoas"><Icon name="users" />Clientes e fornecedores</Link>} />
      <div className="tabs card-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'importar'} className={tab === 'importar' ? 'active' : ''} type="button" onClick={() => setTab('importar')}>Nova importação</button>
        <button role="tab" aria-selected={tab === 'historico'} className={tab === 'historico' ? 'active' : ''} type="button" onClick={() => setTab('historico')}>Histórico ({batches.rows.length})</button>
      </div>

      {tab === 'historico' && (
        <div className="card">
          {batches.loading ? <Loading /> : batches.rows.length === 0 ? <Empty icon="history">Nenhuma importação realizada.</Empty> : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Arquivo</th><th>Data</th><th>Situação</th><th className="num">Linhas</th><th className="num">Novos</th><th className="num">Contas</th><th className="num">Erros</th></tr></thead>
                <tbody>
                  {batches.rows.map((b) => (
                    <tr key={b.id} className="clickable" tabIndex={0} onClick={() => setBatchDetail(b)} onKeyDown={(e) => { if (e.key === 'Enter') setBatchDetail(b); }}>
                      <td className="td-main" data-label="Arquivo"><div className="cell-main">{b.file_name}</div><div className="cell-sub">{b.source}{b.sheet_name ? ` · aba ${b.sheet_name}` : ''}</div></td>
                      <td data-label="Data" className="nowrap">{fdatetime(b.created_at)}</td>
                      <td data-label="Situação"><Badge tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Badge></td>
                      <td data-label="Linhas" className="num">{b.total_rows}</td>
                      <td data-label="Novos" className="num">{b.created_count}</td>
                      <td data-label="Contas" className="num">{b.receivables_created}</td>
                      <td data-label="Erros" className="num">{b.error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'importar' && (
        <>
          <ol className="stepper" aria-label="Etapas">
            {(['arquivo', 'mapeamento', 'previa', 'resultado'] as const).map((s, i) => (
              <li key={s} className={step === s || (s === 'resultado' && step === 'gravando') ? 'active' : ''}><span>{i + 1}</span>{s === 'arquivo' ? 'Arquivo' : s === 'mapeamento' ? 'Colunas' : s === 'previa' ? 'Prévia' : 'Resultado'}</li>
            ))}
          </ol>

          {step === 'arquivo' && (
            <div className="card card-pad">
              {!writable && <Callout tone="warning" icon="lock">Seu perfil pode consultar o histórico, mas não importar planilhas.</Callout>}
              <label className={`dropzone ${!writable ? 'disabled' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && writable) onFile(f); }}>
                <Icon name="upload" />
                <b>{reading ? 'Lendo arquivo…' : 'Selecione ou arraste a planilha'}</b>
                <span className="muted">Excel (.xlsx) ou CSV · até 15 MB · nada é gravado antes da sua confirmação</span>
                <input type="file" accept=".xlsx,.csv,.txt" hidden disabled={!writable || reading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              </label>
              <Callout tone="info" icon="info">
                O layout oficial das planilhas do Estado ainda será homologado com um arquivo real. O importador é configurável:
                as colunas são sugeridas automaticamente e você confirma o mapeamento, que fica salvo para as próximas planilhas iguais.
              </Callout>
            </div>
          )}

          {step === 'mapeamento' && file && sheet && (
            <div className="card card-pad">
              <div className="row mb">
                <Badge tone="info">{file.name}</Badge>
                <span className="muted">{dataRows.length} linha(s) de dados</span>
                {previousImport && <Badge tone="warning">Este arquivo já foi importado em {fdatetime(previousImport.created_at)} — lançamentos repetidos serão ignorados</Badge>}
                <span className="spacer" />
                <button className="btn sm" type="button" onClick={reset}>Trocar arquivo</button>
              </div>
              <div className="form-grid">
                {file.sheets.length > 1 && (
                  <Field label="Aba da planilha">
                    <select className="select" value={sheetIdx} onChange={(e) => selectSheet(file.sheets, Number(e.target.value))}>
                      {file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} linhas)</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Linha do cabeçalho" hint="Detectada automaticamente">
                  <select className="select" value={headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setMapping(autoMap(sheet.rows[h] ?? [])); }}>
                    {sheet.rows.slice(0, 10).map((r, i) => <option key={i} value={i}>Linha {i + 1}: {r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 60)}</option>)}
                  </select>
                </Field>
              </div>
              <h4 className="form-section">Correspondência das colunas</h4>
              <div className="mapping-grid">
                {FIELD_DEFS.map((def) => (
                  <Field key={def.field} label={`${def.label}${def.group === 'Identificação' ? ' ★' : ''}`}>
                    <select className="select" value={mapping[def.field] ?? ''} onChange={(e) => setMapping((m) => { const next = { ...m }; if (e.target.value === '') delete next[def.field]; else next[def.field as ImportField] = Number(e.target.value); return next; })}>
                      <option value="">— não importar —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              <p className="hint">★ Identificação: a associação usa primeiro UF + Inscrição Estadual, depois CPF/CNPJ. O nome serve apenas como apoio e, sozinho, sempre pede confirmação.</p>

              <h4 className="form-section">Opções</h4>
              <div className="form-grid">
                <Field label="Origem (registrada no histórico)"><TextInput value={opts.source} onChange={(e) => setOpts({ ...opts, source: e.target.value })} /></Field>
                <Field label="UF padrão da inscrição" hint="Usada quando a planilha não informa a UF"><select className="select" value={opts.defaultUf} onChange={(e) => setOpts({ ...opts, defaultUf: e.target.value })}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
                <div className="field"><Callout tone="info" icon="info">Cadastros existentes só são alterados depois da <b>conferência das diferenças</b> na prévia. Campos vazios na planilha nunca apagam dados.</Callout></div>
                <div className="field checks-stack">
                  <label className="check"><input type="checkbox" checked={opts.createParties} onChange={(e) => setOpts({ ...opts, createParties: e.target.checked })} />Cadastrar produtores não encontrados</label>
                  <label className="check"><input type="checkbox" checked={opts.generateReceivables} disabled={!hasFinancial} onChange={(e) => setOpts({ ...opts, generateReceivables: e.target.checked })} />Gerar contas a receber {hasFinancial ? '' : '(associe Valor e Vencimento)'}</label>
                  <label className="check"><input type="checkbox" checked={opts.generateCharges} disabled={!hasFinancial || !opts.generateReceivables} onChange={(e) => setOpts({ ...opts, generateCharges: e.target.checked })} />Gerar cobrança para cada conta</label>
                </div>
                {hasFinancial && opts.generateReceivables && <>
                  <Field label="Descrição padrão do lançamento"><TextInput value={opts.defaultDescription} onChange={(e) => setOpts({ ...opts, defaultDescription: e.target.value })} /></Field>
                  <Field label="Competência padrão" hint="Quando a planilha não tiver coluna de competência"><input className="input" type="month" value={opts.defaultReference ?? ''} onChange={(e) => setOpts({ ...opts, defaultReference: e.target.value || null })} /></Field>
                  <Field label="Categoria de receita">
                    <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">—</option>{categories.rows.filter((c) => c.type === 'receita' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                </>}
              </div>
              <h4 className="form-section">Primeiras linhas</h4>
              <div className="table-wrap preview-table">
                <table className="table">
                  <thead><tr>{headers.map((h, i) => <th key={i}>{h || `Coluna ${i + 1}`}{Object.entries(mapping).filter(([, idx]) => idx === i).map(([f]) => <div key={f} className="cell-sub mapped">→ {FIELD_DEFS.find((d) => d.field === f)?.label}</div>)}</th>)}</tr></thead>
                  <tbody>{dataRows.slice(0, 5).map((r, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="row mt"><span className="spacer" /><button className="btn primary" type="button" onClick={analyze} disabled={parties.loading || regs.loading}>Analisar planilha<Icon name="search" /></button></div>
            </div>
          )}

          {step === 'previa' && (
            <>
              <div className="grid kpis import-kpis">
                {(Object.keys(CLASS_META) as RowClass[]).map((c) => (
                  <button key={c} type="button" className={`card kpi as-button ${filter === c ? 'selected' : ''}`} onClick={() => setFilter(filter === c ? '' : c)} aria-pressed={filter === c}>
                    <div className="kpi-top"><span>{CLASS_META[c].label}</span><Badge tone={CLASS_META[c].tone}>{summary[c]}</Badge></div>
                    <div className="kpi-sub">{CLASS_META[c].help}</div>
                  </button>
                ))}
              </div>
              <Callout tone="info" icon="info">
                Nenhum dado foi gravado ainda. {summary.financial > 0 && <>Até <b>{summary.financial}</b> conta(s) a receber, totalizando até <b>{brl(summary.amount)}</b> (linhas em revisão dependem da sua confirmação). </>}
                {pendingReview > 0 && <b>{pendingReview} linha(s) aguardam sua confirmação. </b>}
                Linhas com erro podem ser baixadas para correção.
              </Callout>
              <div className="card mt">
                <div className="toolbar">
                  <b>{filter ? CLASS_META[filter].label : 'Todas as linhas'}</b>
                  <span className="spacer" />
                  {totalChanges > 0 && <>
                    <button className="btn sm" type="button" onClick={() => approveAll('preencher')}>Aprovar só campos vazios</button>
                    <button className="btn sm" type="button" onClick={() => approveAll()}>Aprovar todas as diferenças</button>
                    {approvedCount > 0 && <button className="btn sm ghost" type="button" onClick={() => setApproved({})}>Limpar aprovações</button>}
                  </>}
                  {summary.erro + summary.revisar > 0 && <button className="btn sm" type="button" onClick={() => downloadText(`erros-${file?.name ?? 'planilha'}.csv`, errorsCsv(analysis.filter((r) => r.cls === 'erro' || r.cls === 'revisar').map((r) => ({ ...r, cls: CLASS_META[r.cls].label }))))}><Icon name="download" />Relatório de erros (CSV)</button>}
                  <button className="btn sm" type="button" onClick={() => setStep('mapeamento')}>Voltar ao mapeamento</button>
                </div>
                <div className="table-wrap">
                  <table className="table responsive">
                    <thead><tr><th>Linha</th><th>Produtor</th><th>Identificação</th><th className="num">Valor</th><th>Situação</th><th>Detalhes / decisão</th></tr></thead>
                    <tbody>
                      {analysis.filter((r) => !filter || r.cls === filter).slice(0, 500).map((r) => (
                        <tr key={r.rowNumber}>
                          <td data-label="Linha">{r.rowNumber}</td>
                          <td className="td-main" data-label="Produtor"><div className="cell-main">{r.name || '—'}</div>{r.partyId && <div className="cell-sub">Cadastro: {partyName(r.partyId)}</div>}</td>
                          <td data-label="Identificação" className="nowrap">{r.ie ? `${r.uf} ${formatIE(r.uf, r.ie)}` : ''}{r.document && <div className="cell-sub">{formatDocument(r.document)}</div>}</td>
                          <td data-label="Valor" className="num">{r.amount != null ? brl(r.amount) : '—'}{r.due_date && <div className="cell-sub">venc. {fdate(r.due_date)}</div>}</td>
                          <td data-label="Situação"><Badge tone={CLASS_META[r.cls].tone}>{CLASS_META[r.cls].label}</Badge></td>
                          <td data-label="Detalhes" className="details-cell">
                            {r.errors.map((e) => <div key={e} className="text-danger small">{e}</div>)}
                            {r.warnings.map((w) => <div key={w} className="text-warning small">{w}</div>)}
                            {r.cls !== 'erro' && r.changes.length > 0 && (
                              <fieldset className="changes">
                                <legend>Diferenças com o cadastro — marque o que deve ser atualizado</legend>
                                {r.changes.map((c) => (
                                  <label key={c.field} className="check change-item">
                                    <input type="checkbox" checked={(approved[r.rowNumber] ?? []).includes(c.field)} onChange={() => toggleChange(r.rowNumber, c.field)} aria-label={`Atualizar ${c.label} da linha ${r.rowNumber}`} />
                                    <span><b>{c.label}:</b> {c.from ? <><s>{c.from}</s> → </> : <span className="muted">(vazio) → </span>}{c.to}</span>
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            {r.newRegistration && <div className="small muted">Nova inscrição estadual para este produtor</div>}
                            {r.cls === 'revisar' && (
                              <select className="select sm" aria-label={`Decisão da linha ${r.rowNumber}`} value={decisions[r.rowNumber] ? (decisions[r.rowNumber].action === 'link' ? `link:${(decisions[r.rowNumber] as { partyId: string }).partyId}` : decisions[r.rowNumber].action) : ''}
                                onChange={(e) => setDecisions((d) => {
                                  const v = e.target.value; const next = { ...d };
                                  if (!v) delete next[r.rowNumber];
                                  else next[r.rowNumber] = v.startsWith('link:') ? { action: 'link', partyId: v.slice(5) } : { action: v as 'create' | 'skip' };
                                  return next;
                                })}>
                                <option value="">Escolha…</option>
                                {r.candidates.map((c) => <option key={c.partyId} value={`link:${c.partyId}`}>Associar a {partyName(c.partyId)} ({c.reason})</option>)}
                                {r.name && <option value="create">Criar novo cadastro</option>}
                                <option value="skip">Ignorar esta linha</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {analysis.filter((r) => !filter || r.cls === filter).length > 500 && <div className="pager"><span>Exibindo as 500 primeiras linhas; todas serão processadas.</span></div>}
              </div>
              <div className="row mt"><span className="spacer" /><button className="btn primary" type="button" onClick={commit} disabled={!writable || analysis.every((r) => r.cls === 'erro' || r.cls === 'duplicado')}><Icon name="check" />Confirmar e importar</button></div>
            </>
          )}

          {step === 'gravando' && (
            <div className="card card-pad">
              <h3>Importando…</h3>
              <div className="progress mt" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
              <p className="muted mt-sm">{progress.done} de {progress.total} linha(s). Não feche esta página.</p>
            </div>
          )}

          {step === 'resultado' && result && (
            <div className="card card-pad">
              <h3><Icon name="check" /> Importação {BATCH_STATUS[result.status].label.toLowerCase()}</h3>
              <dl className="kv mt">
                <dt>Cadastros criados</dt><dd>{result.created_count}</dd>
                <dt>Cadastros atualizados</dt><dd>{result.updated_count}</dd>
                <dt>Associados sem alteração</dt><dd>{result.linked_count}</dd>
                <dt>Contas a receber geradas</dt><dd>{result.receivables_created}</dd>
                <dt>Cobranças geradas</dt><dd>{result.charges_created}</dd>
                <dt>Ignoradas</dt><dd>{result.skipped_count}</dd>
                <dt>Com erro</dt><dd>{result.error_count}</dd>
              </dl>
              <div className="row mt">
                <button className="btn" type="button" onClick={() => setBatchDetail(result)}>Ver linha a linha</button>
                <Link className="btn" to="/receber?status=aberto">Contas a receber</Link>
                <Link className="btn" to="/cobrancas">Cobranças</Link>
                <span className="spacer" />
                <button className="btn primary" type="button" onClick={reset}>Nova importação</button>
              </div>
            </div>
          )}
        </>
      )}

      {batchDetail && <BatchDetail batch={batchDetail} onClose={() => setBatchDetail(null)} />}
    </>
  );
}

function BatchDetail({ batch, onClose }: { batch: ImportBatch; onClose(): void }) {
  const rows = useTable('import_rows');
  const parties = useTable('parties');
  const mine = rows.rows.filter((r) => r.batch_id === batch.id).sort((a, b) => a.row_number - b.row_number);
  const STATUS: Record<string, { label: string; tone: string }> = {
    cadastro_criado: { label: 'Cadastro criado', tone: 'primary' }, cadastro_atualizado: { label: 'Cadastro atualizado', tone: 'info' },
    vinculado: { label: 'Associado', tone: 'success' }, duplicado: { label: 'Já importado', tone: 'muted' }, ignorado: { label: 'Ignorado', tone: 'muted' }, erro: { label: 'Erro', tone: 'danger' },
  };
  const notImported = mine.filter((r) => r.status === 'erro' || r.status === 'ignorado');
  return (
    <Modal wide title={`Importação: ${batch.file_name}`} onClose={onClose}
      footer={<>
        {notImported.length > 0 && <button className="btn" type="button" onClick={() => downloadText(`nao-importados-${batch.file_name}.csv`, errorsCsv(notImported.map((r) => ({ rowNumber: r.row_number, cls: STATUS[r.status].label, message: r.message, raw: r.raw }))))}><Icon name="download" />Não importados (CSV)</button>}
        <span className="spacer" />
        <button className="btn primary" type="button" onClick={onClose}>Fechar</button>
      </>}>
      <dl className="kv">
        <dt>Data</dt><dd>{fdatetime(batch.created_at)}</dd>
        <dt>Origem</dt><dd>{batch.source}{batch.sheet_name ? ` · aba ${batch.sheet_name}` : ''}</dd>
        <dt>Arquivo (SHA-256)</dt><dd className="mono small">{batch.file_sha256.slice(0, 16)}…</dd>
        <dt>Resultado</dt><dd>{batch.created_count} novos · {batch.updated_count} atualizados · {batch.receivables_created} contas · {batch.charges_created} cobranças · {batch.error_count} erros</dd>
      </dl>
      {rows.loading ? <Loading /> : (
        <div className="table-wrap mt">
          <table className="table responsive">
            <thead><tr><th>Linha</th><th>Situação</th><th>Cadastro</th><th>Mensagem</th></tr></thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td data-label="Linha">{r.row_number}</td>
                  <td data-label="Situação"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  <td data-label="Cadastro">{r.party_id ? <Link to={`/cadastros/pessoas?abrir=${r.party_id}`} onClick={onClose}>{parties.rows.find((p) => p.id === r.party_id)?.name ?? 'Abrir'}</Link> : '—'}</td>
                  <td data-label="Mensagem" className="small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
