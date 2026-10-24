// Dados DEMONSTRATIVOS. Nomes, documentos e valores são fictícios e gerados
// de forma determinística; nenhum corresponde a pessoas ou empresas reais.
// Os serviços NÃO têm códigos tributários: esses dependem da contabilidade.
import { addDays, addMonths, round2 } from '../lib/format';
import { nextRecurrenceDate } from '../lib/finance';
import type { Category, Charge, FiscalIssuer, Party, PartyRegistration, Payable, PayablePayment, Profile, Receivable, ReceivablePayment, Service, Tables } from '../lib/types';

export type DemoDb = { [K in keyof Tables]: Tables[K][] } & { seq: number; seededFor: string };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkDigits(base: number[], weightsFor: (len: number) => number[]) {
  const digits = [...base];
  for (let k = 0; k < 2; k++) {
    const w = weightsFor(digits.length);
    const sum = digits.reduce((acc, d, i) => acc + d * w[i], 0);
    const r = sum % 11;
    digits.push(r < 2 ? 0 : 11 - r);
  }
  return digits.join('');
}
const cpfWeights = (len: number) => Array.from({ length: len }, (_, i) => len + 1 - i);
/** IE fictícia de MS com dígito verificador válido (prefixo 28). */
function msIe(base6: number[]) {
  const d = [2, 8, ...base6];
  const sum = d.reduce((a, x, i) => a + x * (9 - i), 0);
  const r = sum % 11;
  const t = r === 0 ? 0 : 11 - r;
  return [...d, t > 9 ? 0 : t].join('');
}
const cnpjWeights = (len: number) => (len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

export const DEMO_USERS: Profile[] = [
  { id: 'demo-admin', full_name: 'Ana Administradora', email: 'admin@demo.local', role: 'admin', active: true },
  { id: 'demo-financeiro', full_name: 'Bruno Financeiro', email: 'financeiro@demo.local', role: 'financeiro', active: true },
  { id: 'demo-fiscal', full_name: 'Carla Fiscal', email: 'fiscal@demo.local', role: 'fiscal', active: true },
  { id: 'demo-consulta', full_name: 'Diego Consulta', email: 'consulta@demo.local', role: 'consulta', active: true },
];

const PEOPLE = ['Marina Albuquerque', 'Rodrigo Tavares', 'Juliana Coutinho', 'Fernando Barreto', 'Patrícia Lemos', 'Gustavo Rezende'];
const COMPANIES: [string, 'cliente' | 'fornecedor' | 'ambos'][] = [
  ['Agropecuária Horizonte Demo Ltda', 'cliente'], ['Laticínios Vale Verde Demo Ltda', 'cliente'],
  ['Cooperativa Rural Exemplo', 'ambos'], ['Fazenda Boa Esperança Demo', 'cliente'],
  ['Papelaria Central Demo Ltda', 'fornecedor'], ['Imobiliária Exemplo Ltda', 'fornecedor'],
  ['Energia Demo Distribuidora', 'fornecedor'], ['Telecom Exemplo S.A.', 'fornecedor'],
  ['Contabilidade Exemplo Ltda', 'fornecedor'],
];

export function buildDemoDb(todayIso: string): DemoDb {
  const r = rng(20261024);
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  let seq = 1;
  const id = (p: string) => `${p}-${String(seq++).padStart(4, '0')}`;
  const created = addDays(todayIso, -200) + 'T12:00:00Z';

  const categories: Category[] = [
    ['Mensalidades de associados', 'receita'], ['Prestação de serviços', 'receita'], ['Eventos e cursos', 'receita'],
    ['Doações e patrocínios', 'receita'], ['Folha de pagamento', 'despesa'], ['Aluguel e condomínio', 'despesa'],
    ['Energia, água e internet', 'despesa'], ['Material de escritório', 'despesa'], ['Serviços de terceiros', 'despesa'],
    ['Impostos e taxas', 'despesa'],
  ].map(([name, type]) => ({ id: id('cat'), name, type: type as Category['type'], active: true }));
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;

  const services: Service[] = [
    ['Serviço demonstrativo A', 350], ['Serviço demonstrativo B', 1200], ['Curso demonstrativo', 480],
  ].map(([name, amount]) => ({
    id: id('srv'), name: name as string, description: 'Exemplo — substituir pelos serviços reais da ASSOCIAPEC',
    default_amount: amount as number, category_id: cat('Prestação de serviços'), c_trib_mun: null, c_trib_nac: null,
    nbs: null, iss_rate: null, tax_validated: false, tax_validated_by: null, tax_validated_at: null,
    tax_notes: 'Aguardando definição do código na tabela oficial e validação da contabilidade.', active: true,
  }));

  const blankParty = {
    trade_name: null, state_registration: null, municipal_registration: null, contact_name: null, cep: null,
    street: null, number: null, complement: null, district: null, city: 'Campo Grande', uf: 'MS', city_ibge_code: null,
    notes: null, active: true, created_at: created,
  };
  const parties: Party[] = [
    ...PEOPLE.map((name) => ({
      ...blankParty, id: id('pes'), kind: 'cliente' as const, person_type: 'PF' as const, name,
      document: checkDigits(Array.from({ length: 9 }, () => int(0, 9)), cpfWeights),
      email: name.split(' ')[0].toLowerCase() + '@exemplo.com.br', phone: `(67) 9${int(1000, 9999)}-${int(1000, 9999)}`,
    })),
    ...COMPANIES.map(([name, kind]) => ({
      ...blankParty, id: id('pes'), kind, person_type: 'PJ' as const, name,
      document: checkDigits([...Array.from({ length: 8 }, () => int(0, 9)), 0, 0, 0, 1], cnpjWeights),
      email: 'contato@' + name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.exemplo.com.br',
      phone: `(67) 3${int(100, 999)}-${int(1000, 9999)}`, contact_name: 'Responsável financeiro',
    })),
  ];
  // produtores rurais: pessoas físicas e empresas do agro; cada um com IE de MS,
  // e alguns com uma segunda propriedade (mesmo CPF/CNPJ, outra IE)
  const party_registrations: PartyRegistration[] = [];
  parties.forEach((p) => {
    const rural = p.person_type === 'PF' || /Agropecu|Fazenda|Cooperativa|Latic/.test(p.name);
    p.rural_producer = rural;
    if (!rural) return;
    const props = p.person_type === 'PF' && r() < 0.35 ? 2 : 1;
    for (let k = 0; k < props; k++) {
      party_registrations.push({
        id: id('ie'), party_id: p.id, uf: 'MS', ie: msIe(Array.from({ length: 6 }, () => int(0, 9))),
        property_name: p.person_type === 'PF' ? `Fazenda ${pick(['Santa Rita', 'Boa Vista', 'São João', 'Três Lagoas', 'Esperança', 'Recanto'])} (fictícia)` : 'Sede',
        city: pick(['Campo Grande', 'Dourados', 'Sidrolândia', 'Terenos', 'Ribas do Rio Pardo']), city_ibge_code: null,
        status: null, checked_at: null, is_primary: k === 0, active: true, notes: null, created_at: created,
      });
    }
  });
  const clients = parties.filter((p) => p.kind !== 'fornecedor');
  const suppliers = parties.filter((p) => p.kind !== 'cliente');

  const receivables: Receivable[] = [];
  const receivable_payments: ReceivablePayment[] = [];
  const base = { document_number: null, canceled_at: null, cancel_reason: null, notes: null, created_at: created };
  clients.forEach((c, idx) => {
    const profile = idx % 5 === 3 ? 'inadimplente' : idx % 4 === 1 ? 'atrasa' : 'pontual';
    for (let m = -5; m <= 1; m++) {
      const due = addMonths(todayIso.slice(0, 8) + String(pick([5, 10, 15, 20])).padStart(2, '0'), m);
      const isService = r() < 0.3;
      const srv = pick(services);
      const amount = isService ? srv.default_amount! : pick([180, 220, 260]);
      const rec: Receivable = {
        ...base, id: id('rec'), party_id: c.id, category_id: isService ? cat('Prestação de serviços') : cat('Mensalidades de associados'),
        service_id: isService ? srv.id : null, description: isService ? srv.name : `Mensalidade ${due.slice(5, 7)}/${due.slice(0, 4)}`,
        issue_date: addDays(due, -10), due_date: due, amount, paid_amount: 0,
      };
      receivables.push(rec);
      if (due > todayIso) continue;
      const late = Math.round((Date.parse(todayIso) - Date.parse(due)) / 864e5);
      const chance = profile === 'pontual' ? 0.95 : profile === 'atrasa' ? 0.7 : late > 60 ? 0.6 : 0;
      if (r() < chance) {
        const partial = profile === 'atrasa' && r() < 0.25;
        const value = partial ? round2(amount / 2) : amount;
        let paidAt = addDays(due, profile === 'pontual' ? int(-3, 1) : int(0, 15));
        if (paidAt > todayIso) paidAt = todayIso;
        receivable_payments.push({ id: id('rpg'), receivable_id: rec.id, paid_at: paidAt, amount: value, method: pick(['PIX', 'PIX', 'Boleto', 'Transferência']), notes: null, created_at: paidAt + 'T12:00:00Z' });
        rec.paid_amount = value;
      }
    }
  });

  const payables: Payable[] = [];
  const payable_payments: PayablePayment[] = [];
  const fixed: [string, string, number, string][] = [
    ['Aluguel da sede', 'Aluguel e condomínio', 2800, 'Imobiliária'], ['Energia elétrica', 'Energia, água e internet', 640, 'Energia'],
    ['Internet e telefone', 'Energia, água e internet', 310, 'Telecom'], ['Honorários contábeis', 'Serviços de terceiros', 1500, 'Contabilidade'],
  ];
  for (const [desc, catName, amount, who] of fixed) {
    const supplier = suppliers.find((s) => s.name.startsWith(who)) ?? null;
    let parent: string | null = null;
    let due = addMonths(todayIso.slice(0, 8) + '10', -4);
    for (let k = 0; k < 6; k++) {
      const p: Payable = {
        ...base, id: id('pag'), party_id: supplier?.id ?? null, category_id: cat(catName), description: desc,
        due_date: due, amount: round2(amount * (catName.startsWith('Energia') ? 0.9 + r() * 0.2 : 1)), paid_amount: 0,
        recurrence: 'mensal', recurrence_parent_id: parent,
      };
      payables.push(p);
      parent = parent ?? p.id;
      if (due < todayIso && !(k === 3 && desc.startsWith('Internet'))) {
        payable_payments.push({ id: id('ppg'), payable_id: p.id, paid_at: addDays(due, int(-2, 0)), amount: p.amount, method: pick(['PIX', 'Boleto']), notes: null, created_at: due + 'T12:00:00Z' });
        p.paid_amount = p.amount;
      }
      due = nextRecurrenceDate(due, 'mensal')!;
      if (due > addDays(todayIso, 25)) break;
    }
  }
  const papelaria = suppliers.find((s) => s.name.startsWith('Papelaria'))!;
  payables.push({ ...base, id: id('pag'), party_id: papelaria.id, category_id: cat('Material de escritório'), description: 'Material de escritório', due_date: addDays(todayIso, 3), amount: 420.5, paid_amount: 0, recurrence: 'nenhuma', recurrence_parent_id: null });
  payables.push({ ...base, id: id('pag'), party_id: null, category_id: cat('Impostos e taxas'), description: 'Taxa municipal (exemplo)', due_date: addDays(todayIso, -6), amount: 185, paid_amount: 0, recurrence: 'anual', recurrence_parent_id: null });

  // algumas cobranças internas para contas em aberto
  const charges: Charge[] = [];
  const year = Number(todayIso.slice(0, 4));
  receivables.filter((rc) => rc.paid_amount < rc.amount && rc.due_date >= addDays(todayIso, -40)).slice(0, 6).forEach((rc, i) => {
    charges.push({
      id: id('cob'), code: `COB-${year}-${String(i + 1).padStart(5, '0')}`, year, number: i + 1, receivable_id: rc.id, party_id: rc.party_id,
      amount: rc.amount, due_date: rc.due_date, description: rc.description, notes: null, canceled_at: null, cancel_reason: null,
      last_notified_at: null, notification_channel: null, created_at: created,
    });
  });

  const emptyIssuer = (environment: FiscalIssuer['environment']): FiscalIssuer => ({
    environment, cnpj: null, legal_name: null, trade_name: null, municipal_registration: null, city_ibge_code: null,
    tax_regime: null, simples_nacional: null, email: null, phone: null, address: null, certificate_type: 'a_confirmar',
    certificate_valid_until: null, certificate_notes: null, dps_series: null, next_dps_number: 1,
  });

  return {
    seq, seededFor: todayIso,
    profiles: DEMO_USERS.map((u) => ({ ...u })),
    parties, categories, services, receivables, receivable_payments, payables, payable_payments,
    attachments: [], audit_log: [], fiscal_issuer: [emptyIssuer('homologacao'), emptyIssuer('producao')],
    nfse_documents: [], nfse_requests: [],
    party_registrations, charges, import_batches: [], import_rows: [],
  };
}
