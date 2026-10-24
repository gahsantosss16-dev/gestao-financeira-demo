// Tipos de domínio — espelham as tabelas de supabase/migrations.
export type Role = 'admin' | 'financeiro' | 'fiscal' | 'consulta';
export type FiscalEnv = 'homologacao' | 'producao';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  active: boolean;
  created_at?: string;
}

export type PartyKind = 'cliente' | 'fornecedor' | 'ambos';
export type PersonType = 'PF' | 'PJ';

export interface Party {
  id: string;
  kind: PartyKind;
  person_type: PersonType;
  name: string;
  trade_name: string | null;
  document: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  uf: string | null;
  city_ibge_code: string | null;
  notes: string | null;
  active: boolean;
  rural_producer?: boolean;
  created_at?: string;
}

/** Inscrição estadual (propriedade). Um cadastro pode ter várias; UF + IE é único. */
export interface PartyRegistration {
  id: string;
  party_id: string;
  uf: string;
  ie: string;
  property_name: string | null;
  city: string | null;
  city_ibge_code: string | null;
  status: string | null;
  checked_at: string | null;
  is_primary: boolean;
  active: boolean;
  notes: string | null;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'receita' | 'despesa';
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  default_amount: number | null;
  category_id: string | null;
  c_trib_mun: string | null;
  c_trib_nac: string | null;
  nbs: string | null;
  iss_rate: number | null;
  tax_validated: boolean;
  tax_validated_by: string | null;
  tax_validated_at: string | null;
  tax_notes: string | null;
  active: boolean;
}

interface AccountBase {
  id: string;
  party_id: string | null;
  category_id: string | null;
  description: string;
  document_number: string | null;
  due_date: string;
  amount: number;
  paid_amount: number;
  canceled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at?: string;
}

export interface Receivable extends AccountBase {
  party_id: string;
  service_id: string | null;
  issue_date: string;
  registration_id?: string | null;
  import_batch_id?: string | null;
  import_row_number?: number | null;
  import_key?: string | null;
}

export type Recurrence = 'nenhuma' | 'mensal' | 'trimestral' | 'anual';
export interface Payable extends AccountBase {
  recurrence: Recurrence;
  recurrence_parent_id: string | null;
}

export interface Payment {
  id: string;
  paid_at: string;
  amount: number;
  method: string;
  notes: string | null;
  created_at?: string;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  client_request_id?: string | null;
}
export interface ReceivablePayment extends Payment { receivable_id: string }
export interface PayablePayment extends Payment { payable_id: string }

export interface Attachment {
  id: string;
  entity: 'payable' | 'receivable';
  entity_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at?: string;
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor: string | null;
  at: string;
}

export interface FiscalIssuer {
  environment: FiscalEnv;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  municipal_registration: string | null;
  city_ibge_code: string | null;
  tax_regime: string | null;
  simples_nacional: boolean | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  certificate_type: 'a_confirmar' | 'A1' | 'A3';
  certificate_valid_until: string | null;
  certificate_notes: string | null;
  dps_series: string | null;
  next_dps_number: number;
}

export type NfseStatus = 'rascunho' | 'validada' | 'enviada' | 'autorizada' | 'rejeitada' | 'cancelada';
export interface NfseDocument {
  id: string;
  environment: FiscalEnv;
  receivable_id: string | null;
  party_id: string;
  service_id: string;
  status: NfseStatus;
  competence_date: string;
  amount: number;
  description: string;
  c_trib_mun: string;
  dps_series: string | null;
  dps_number: number | null;
  dps_id: string | null;
  chave_acesso: string | null;
  last_error: string | null;
  created_at?: string;
}

export interface NfseRequest {
  id: number;
  nfse_document_id: string | null;
  environment: FiscalEnv;
  operation: 'emitir' | 'consultar_nfse' | 'consultar_dps' | 'evento';
  http_method: string;
  url: string;
  http_status: number | null;
  error: string | null;
  created_at: string;
}

export interface Charge {
  id: string;
  code: string;
  year: number;
  number: number;
  receivable_id: string;
  party_id: string;
  amount: number;
  due_date: string;
  description: string;
  notes: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  last_notified_at: string | null;
  notification_channel: string | null;
  created_at?: string;
}

export interface ImportBatch {
  id: string;
  file_name: string;
  file_sha256: string;
  source: string;
  sheet_name: string | null;
  mapping: Record<string, string>;
  options: Record<string, unknown>;
  status: 'processando' | 'concluida' | 'concluida_com_erros' | 'interrompida';
  total_rows: number;
  created_count: number;
  updated_count: number;
  linked_count: number;
  skipped_count: number;
  error_count: number;
  receivables_created: number;
  charges_created: number;
  created_by?: string | null;
  created_at: string;
  finished_at: string | null;
}

export type ImportRowStatus = 'cadastro_criado' | 'cadastro_atualizado' | 'vinculado' | 'duplicado' | 'ignorado' | 'erro';
export interface ImportRow {
  id: number;
  batch_id: string;
  row_number: number;
  raw: Record<string, unknown>;
  status: ImportRowStatus;
  party_id: string | null;
  registration_id: string | null;
  receivable_id: string | null;
  charge_id: string | null;
  message: string | null;
  created_at?: string;
}

export interface Tables {
  profiles: Profile;
  parties: Party;
  categories: Category;
  services: Service;
  receivables: Receivable;
  receivable_payments: ReceivablePayment;
  payables: Payable;
  payable_payments: PayablePayment;
  attachments: Attachment;
  audit_log: AuditEntry;
  fiscal_issuer: FiscalIssuer;
  nfse_documents: NfseDocument;
  nfse_requests: NfseRequest;
  party_registrations: PartyRegistration;
  charges: Charge;
  import_batches: ImportBatch;
  import_rows: ImportRow;
}
export type TableName = keyof Tables;
