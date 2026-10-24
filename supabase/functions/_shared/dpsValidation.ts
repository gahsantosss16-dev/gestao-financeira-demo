// Pré-validação de negócio de uma DPS antes da geração do XML.
// NÃO substitui a validação contra o XSD oficial (Etapa 3) e NÃO define
// códigos, alíquotas ou regras tributárias: apenas verifica se os dados
// obrigatórios foram informados e validados por quem é responsável.

export interface DpsIssuerData {
  cnpj: string | null;
  legal_name: string | null;
  municipal_registration: string | null;
  city_ibge_code: string | null;
  certificate_type: string;
  certificate_valid_until: string | null;
  dps_series: string | null;
}
export interface DpsServiceData {
  name: string;
  c_trib_mun: string | null;
  tax_validated: boolean;
}
export interface DpsTakerData {
  name: string;
  document: string | null;
}
export interface DpsDraftData {
  amount: number;
  competence_date: string;
  description: string;
}

export interface DpsIssue {
  field: string;
  message: string;
  /** bloqueante impede o envio; aviso apenas informa */
  severity: 'bloqueante' | 'aviso';
}

export function validateDpsDraft(
  draft: DpsDraftData,
  issuer: DpsIssuerData | null,
  service: DpsServiceData | null,
  taker: DpsTakerData | null,
  todayIso: string,
): DpsIssue[] {
  const issues: DpsIssue[] = [];
  const block = (field: string, message: string) => issues.push({ field, message, severity: 'bloqueante' });

  if (!issuer) {
    block('emitente', 'Dados fiscais da ASSOCIAPEC não cadastrados');
  } else {
    if (!issuer.cnpj) block('emitente.cnpj', 'CNPJ do prestador não informado');
    if (!issuer.legal_name) block('emitente.razao_social', 'Razão social do prestador não informada');
    if (!issuer.municipal_registration) block('emitente.inscricao_municipal', 'Inscrição municipal não informada');
    if (!issuer.city_ibge_code) block('emitente.municipio', 'Código IBGE do município do prestador não informado');
    if (!issuer.dps_series) block('emitente.serie_dps', 'Série da DPS não definida');
    if (issuer.certificate_type === 'a_confirmar') {
      block('certificado', 'Tipo do certificado digital ainda não confirmado');
    } else if (!issuer.certificate_valid_until) {
      block('certificado', 'Validade do certificado digital não informada');
    } else if (issuer.certificate_valid_until < todayIso) {
      block('certificado', 'Certificado digital vencido');
    }
  }

  if (!service) {
    block('servico', 'Selecione o serviço prestado');
  } else {
    if (!service.c_trib_mun) block('servico.cTribMun', `Serviço "${service.name}" sem código de tributação municipal (cTribMun)`);
    if (!service.tax_validated) block('servico.validacao', `Código tributário do serviço "${service.name}" ainda não validado pela contabilidade`);
  }

  if (!taker) block('tomador', 'Selecione o tomador do serviço');
  else if (!taker.document) block('tomador.documento', `Tomador "${taker.name}" sem CPF/CNPJ cadastrado`);

  if (!(draft.amount > 0)) block('valor', 'Valor do serviço deve ser maior que zero');
  if (!draft.description.trim()) block('descricao', 'Descrição do serviço é obrigatória');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.competence_date)) block('competencia', 'Data de competência inválida');
  else if (draft.competence_date > todayIso) issues.push({ field: 'competencia', message: 'Competência no futuro', severity: 'aviso' });

  return issues;
}

export const hasBlockingIssues = (issues: DpsIssue[]) => issues.some((i) => i.severity === 'bloqueante');
