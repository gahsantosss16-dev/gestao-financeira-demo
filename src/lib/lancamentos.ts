import { dividirEmParcelas } from "./money";
import { somarMeses } from "./datas";

export type TipoLancamento = "pagar" | "receber";
export type StatusLancamento = "aberto" | "parcial" | "pago" | "cancelado";
export type SituacaoExibida = StatusLancamento | "vencido";

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  pessoa_id: string | null;
  categoria_id: string | null;
  descricao: string;
  competencia: string;
  vencimento: string;
  valor_centavos: number;
  valor_pago_centavos: number;
  status: StatusLancamento;
  parcela_numero: number;
  parcela_total: number;
  documento_ref: string | null;
  observacoes: string | null;
  pessoa?: { nome: string } | null;
  categoria?: { nome: string } | null;
};

/** "Vencido" é derivado (data), nunca gravado: não depende de rotina diária. */
export function situacao(l: Pick<Lancamento, "status" | "vencimento">, hoje: string): SituacaoExibida {
  if ((l.status === "aberto" || l.status === "parcial") && l.vencimento < hoje) return "vencido";
  return l.status;
}

export function saldoCentavos(l: Pick<Lancamento, "valor_centavos" | "valor_pago_centavos" | "status">): number {
  return l.status === "cancelado" ? 0 : l.valor_centavos - l.valor_pago_centavos;
}

export type NovoLancamentoForm = {
  tipo: TipoLancamento;
  descricao: string;
  pessoa_id: string | null;
  categoria_id: string | null;
  competencia: string;
  primeiroVencimento: string;
  valorTotalCentavos: number;
  parcelas: number;
  documento_ref: string | null;
  observacoes: string | null;
};

export type LancamentoInsert = {
  tipo: TipoLancamento;
  descricao: string;
  pessoa_id: string | null;
  categoria_id: string | null;
  competencia: string;
  vencimento: string;
  valor_centavos: number;
  parcela_numero: number;
  parcela_total: number;
  grupo_parcelamento: string | null;
  documento_ref: string | null;
  observacoes: string | null;
  chave_idempotencia: string;
};

/**
 * Monta as linhas a inserir. As chaves de idempotência são derivadas de uma
 * chave do formulário (gerada uma vez ao abrir), então reenviar o mesmo
 * formulário gera exatamente as mesmas chaves e o banco recusa a duplicata.
 */
export function montarParcelas(form: NovoLancamentoForm, chaveFormulario: string): LancamentoInsert[] {
  const descricao = form.descricao.trim();
  if (!descricao) throw new Error("Informe a descrição.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.primeiroVencimento)) throw new Error("Informe o vencimento.");
  const valores = dividirEmParcelas(form.valorTotalCentavos, form.parcelas);
  const grupo = form.parcelas > 1 ? chaveFormulario : null;
  return valores.map((valor, i) => ({
    tipo: form.tipo,
    descricao: form.parcelas > 1 ? `${descricao} (${i + 1}/${form.parcelas})` : descricao,
    pessoa_id: form.pessoa_id,
    categoria_id: form.categoria_id,
    competencia: form.competencia || form.primeiroVencimento,
    vencimento: somarMeses(form.primeiroVencimento, i),
    valor_centavos: valor,
    parcela_numero: i + 1,
    parcela_total: form.parcelas,
    grupo_parcelamento: grupo,
    documento_ref: form.documento_ref?.trim() || null,
    observacoes: form.observacoes?.trim() || null,
    chave_idempotencia: i === 0 ? chaveFormulario : derivarUuid(chaveFormulario, i),
  }));
}

/** UUID determinístico a partir de outro UUID + índice (troca os últimos 12 hex). */
export function derivarUuid(base: string, indice: number): string {
  const sufixo = (parseInt(base.slice(-12), 16) + indice).toString(16).padStart(12, "0").slice(-12);
  return `${base.slice(0, -12)}${sufixo}`;
}
