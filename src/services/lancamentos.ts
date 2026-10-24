import type { Lancamento, LancamentoInsert, TipoLancamento } from "@/lib/lancamentos";
import { supabase } from "@/lib/supabase";

const COLUNAS =
  "id, tipo, pessoa_id, categoria_id, descricao, competencia, vencimento, valor_centavos, valor_pago_centavos, status, parcela_numero, parcela_total, documento_ref, observacoes, pessoa:pessoas(nome), categoria:categorias(nome)";

export async function listarLancamentos(filtro: { tipo?: TipoLancamento; inicio: string; fim: string }): Promise<Lancamento[]> {
  let query = supabase
    .from("lancamentos")
    .select(COLUNAS)
    .gte("vencimento", filtro.inicio)
    .lte("vencimento", filtro.fim)
    .order("vencimento")
    .limit(1000);
  if (filtro.tipo) query = query.eq("tipo", filtro.tipo);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Lancamento[];
}

/** Lançamentos em aberto vencidos antes de uma data (para o painel). */
export async function listarAtrasados(hoje: string): Promise<Lancamento[]> {
  const { data, error } = await supabase
    .from("lancamentos")
    .select(COLUNAS)
    .in("status", ["aberto", "parcial"])
    .lt("vencimento", hoje)
    .order("vencimento")
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as Lancamento[];
}

/** Insere as parcelas; reenvio com as mesmas chaves é ignorado pelo banco. */
export async function criarLancamentos(linhas: LancamentoInsert[]): Promise<void> {
  const { error } = await supabase
    .from("lancamentos")
    .upsert(linhas, { onConflict: "chave_idempotencia", ignoreDuplicates: true });
  if (error) throw error;
}

export async function registrarBaixa(input: {
  lancamentoId: string;
  valorCentavos: number;
  data: string;
  forma: string;
  contaId: string | null;
  chave: string;
}): Promise<void> {
  const { error } = await supabase.rpc("registrar_baixa", {
    p_lancamento_id: input.lancamentoId,
    p_valor_centavos: input.valorCentavos,
    p_data_pagamento: input.data,
    p_forma_pagamento: input.forma,
    p_conta_id: input.contaId,
    p_chave_idempotencia: input.chave,
  });
  if (error) throw error;
}

export async function cancelarLancamento(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancelar_lancamento", { p_lancamento_id: id, p_motivo: motivo });
  if (error) throw error;
}

export type ResumoMensal = {
  mes: string;
  tipo: TipoLancamento;
  quantidade: number;
  previsto_centavos: number;
  realizado_centavos: number;
  em_aberto_centavos: number;
};

export async function listarResumoMensal(inicio: string, fim: string): Promise<ResumoMensal[]> {
  const { data, error } = await supabase
    .from("vw_resumo_mensal")
    .select("*")
    .gte("mes", inicio)
    .lte("mes", fim)
    .order("mes");
  if (error) throw error;
  return ((data ?? []) as ResumoMensal[]).map((r) => ({
    ...r,
    quantidade: Number(r.quantidade),
    previsto_centavos: Number(r.previsto_centavos),
    realizado_centavos: Number(r.realizado_centavos),
    em_aberto_centavos: Number(r.em_aberto_centavos),
  }));
}
