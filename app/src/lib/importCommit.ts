// Gravação de uma importação já revisada na prévia. Cada linha é processada de
// forma independente (uma falha não interrompe as demais) e fica registrada em
// import_rows com o resultado, para rastrear arquivo e linha de origem.
import type { DataSource } from '../data/source';
import type { AnalyzedRow, ImportOptions } from './importer';
import { ieKey } from './ie';
import type { ImportBatch, ImportRowStatus, Party, PartyRegistration } from './types';

export type RowDecision = { action: 'link'; partyId: string } | { action: 'create' } | { action: 'skip' };

export interface CommitArgs {
  fileName: string;
  sha256: string;
  sheetName: string;
  mapping: Record<string, string>;
  options: ImportOptions;
  rows: AnalyzedRow[];
  decisions: Record<number, RowDecision>;
  categoryId: string | null;
  today: string;
  onProgress?(done: number, total: number): void;
}

const refLabel = (ref: string | null) => (ref ? ` ${ref.slice(5, 7)}/${ref.slice(0, 4)}` : '');

export async function commitImport(source: DataSource, a: CommitArgs): Promise<ImportBatch> {
  const batch = await source.insert('import_batches', {
    file_name: a.fileName, file_sha256: a.sha256, source: a.options.source, sheet_name: a.sheetName,
    mapping: a.mapping, options: { ...a.options }, total_rows: a.rows.length, status: 'processando',
  });
  const [parties, registrations] = await Promise.all([source.list('parties'), source.list('party_registrations')]);
  const partyById = new Map<string, Party>(parties.map((p) => [p.id, p]));
  const regByKey = new Map<string, PartyRegistration>(registrations.map((r) => [ieKey(r.uf, r.ie), r]));
  const hasPrimary = new Set(registrations.filter((r) => r.is_primary).map((r) => r.party_id));
  const createdByIdentity = new Map<string, string>();
  const counts = { created: 0, updated: 0, linked: 0, skipped: 0, errors: 0, receivables: 0, charges: 0 };

  for (const [i, row] of a.rows.entries()) {
    let status: ImportRowStatus = 'vinculado';
    let partyId: string | null = null;
    let registrationId: string | null = row.registrationId;
    let receivableId: string | null = null;
    let chargeId: string | null = null;
    const notes: string[] = [];
    try {
      if (row.cls === 'erro') throw new Error(row.errors.join(' '));
      const decision = a.decisions[row.rowNumber];
      if (row.cls === 'revisar' || decision) {
        if (!decision || decision.action === 'skip') { status = 'ignorado'; notes.push('Ignorada na revisão (associação não confirmada).'); throw Object.assign(new Error('skip'), { skip: true }); }
        if (decision.action === 'link') partyId = decision.partyId;
      } else partyId = row.partyId;

      // cadastro: reutiliza o criado em linha anterior do mesmo lote
      if (!partyId && createdByIdentity.has(row.identity)) partyId = createdByIdentity.get(row.identity)!;
      if (!partyId) {
        const created = await source.insert('parties', {
          kind: 'cliente', person_type: row.document.length === 14 ? 'PJ' : 'PF', name: row.name,
          document: row.document || null, email: row.email || null, phone: row.phone || null, cep: row.cep || null,
          street: row.street || null, city: row.city || null, uf: row.addressUf || row.uf || null, rural_producer: !!row.ie, active: true,
          notes: `Cadastrado pela importação “${a.fileName}” (linha ${row.rowNumber}).`,
        });
        partyById.set(created.id, created);
        partyId = created.id;
        createdByIdentity.set(row.identity, created.id);
        status = 'cadastro_criado';
        counts.created++;
        notes.push('Cadastro criado.');
      } else if (Object.keys(row.updates).length && !decision) {
        await source.update('parties', partyId, row.updates);
        status = 'cadastro_atualizado';
        counts.updated++;
        notes.push(`Atualizado: ${Object.keys(row.updates).join(', ')}.`);
      }

      // inscrição estadual (nova propriedade do mesmo produtor ou primeira IE)
      if (row.ie) {
        const key = ieKey(row.uf, row.ie);
        const existing = regByKey.get(key);
        if (existing && existing.party_id !== partyId) {
          notes.push(`A IE ${row.uf} ${row.ie} já pertence a outro cadastro e não foi movida.`);
        } else if (existing) registrationId = existing.id;
        else {
          const reg = await source.insert('party_registrations', {
            party_id: partyId, uf: row.uf, ie: row.ie, property_name: row.property_name || null, city: row.city || null,
            is_primary: !hasPrimary.has(partyId), active: true,
          });
          regByKey.set(key, reg);
          hasPrimary.add(partyId);
          registrationId = reg.id;
          notes.push('Inscrição estadual incluída.');
        }
      }

      // lançamento financeiro (idempotente pela import_key)
      if (row.financial && row.importKey) {
        try {
          const rec = await source.insert('receivables', {
            party_id: partyId, registration_id: registrationId, category_id: a.categoryId, service_id: null,
            description: row.description || `${a.options.defaultDescription}${refLabel(row.reference)}`,
            document_number: row.document_number || null, issue_date: a.today, due_date: row.due_date!, amount: row.amount!,
            notes: row.notes || null, import_batch_id: batch.id, import_row_number: row.rowNumber, import_key: row.importKey,
          });
          receivableId = rec.id;
          counts.receivables++;
          notes.push('Conta a receber gerada.');
          if (a.options.generateCharges) {
            const ch = await source.insert('charges', { receivable_id: rec.id, party_id: partyId, description: rec.description });
            chargeId = ch.id;
            counts.charges++;
            notes.push(`Cobrança ${ch.code} gerada.`);
          }
        } catch (e) {
          if (/já foi importado/i.test((e as Error).message)) { status = 'duplicado'; notes.push('Lançamento já importado anteriormente (não duplicado).'); }
          else throw e;
        }
      } else if (row.cls === 'duplicado') {
        status = 'duplicado';
        notes.push(...row.warnings);
      }
      if (status === 'vinculado') counts.linked++;
      if (row.warnings.length && status !== 'duplicado') notes.push(...row.warnings);
    } catch (e) {
      if ((e as { skip?: boolean }).skip) counts.skipped++;
      else { status = 'erro'; counts.errors++; notes.push((e as Error).message); }
    }
    await source.insert('import_rows', {
      batch_id: batch.id, row_number: row.rowNumber, raw: row.raw, status, party_id: partyId,
      registration_id: registrationId, receivable_id: receivableId, charge_id: chargeId, message: notes.join(' ').slice(0, 2000) || null,
    });
    a.onProgress?.(i + 1, a.rows.length);
  }

  return source.update('import_batches', batch.id, {
    status: counts.errors ? 'concluida_com_erros' : 'concluida', finished_at: new Date().toISOString(),
    created_count: counts.created, updated_count: counts.updated, linked_count: counts.linked, skipped_count: counts.skipped,
    error_count: counts.errors, receivables_created: counts.receivables, charges_created: counts.charges,
  });
}
