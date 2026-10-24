import type { Role, TableName } from './types';

/**
 * Matriz de permissões. DEVE refletir as políticas RLS de
 * supabase/migrations/20261024000001_fundacao.sql — o banco é quem garante;
 * aqui serve para esconder ações na interface e para o modo demonstração.
 */
type Op = 'read' | 'write' | 'delete';
const ALL: Role[] = ['admin', 'financeiro', 'fiscal', 'consulta'];
const MATRIX: Record<TableName, Record<Op, Role[]>> = {
  profiles: { read: ['admin'], write: ['admin'], delete: [] },
  audit_log: { read: ['admin'], write: [], delete: [] },
  parties: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  categories: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  services: { read: ALL, write: ['admin', 'financeiro', 'fiscal'], delete: ['admin'] },
  receivables: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  receivable_payments: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  payables: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  payable_payments: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  attachments: { read: ALL, write: ['admin', 'financeiro'], delete: ['admin'] },
  fiscal_issuer: { read: ['admin', 'fiscal', 'financeiro'], write: ['admin', 'fiscal'], delete: [] },
  nfse_documents: { read: ALL, write: ['admin', 'fiscal'], delete: ['admin', 'fiscal'] },
  nfse_requests: { read: ['admin', 'fiscal'], write: [], delete: [] },
};

export const can = (role: Role | null | undefined, op: Op, table: TableName) =>
  !!role && MATRIX[table][op].includes(role);

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  fiscal: 'Fiscal',
  consulta: 'Consulta',
};
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Acesso total, gestão de usuários e auditoria',
  financeiro: 'Cadastros, contas a pagar e a receber',
  fiscal: 'Dados fiscais, serviços e notas fiscais',
  consulta: 'Somente leitura',
};
