import type { ConfiguracaoNfse } from "@/lib/nfse/prontidao";
import { supabase } from "@/lib/supabase";

export async function listarConfiguracoesNfse(): Promise<ConfiguracaoNfse[]> {
  const { data, error } = await supabase
    .from("nfse_configuracao")
    .select(
      "ambiente, cnpj_prestador, inscricao_municipal, codigo_municipio_ibge, regime_tributario, codigo_tributacao_nacional, serie_dps, url_api, validada, producao_habilitada",
    );
  if (error) throw error;
  return (data ?? []) as ConfiguracaoNfse[];
}
