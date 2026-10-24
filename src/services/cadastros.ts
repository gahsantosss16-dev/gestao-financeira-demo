import { supabase } from "@/lib/supabase";

export type Pessoa = {
  id: string;
  tipo_pessoa: "PF" | "PJ";
  documento: string | null;
  nome: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigo_municipio_ibge: string | null;
  papeis: string[];
  observacoes: string | null;
  ativo: boolean;
};

export type PessoaInput = Omit<Pessoa, "id">;
export type Opcao = { id: string; nome: string };

const PESSOA_COLUNAS =
  "id, tipo_pessoa, documento, nome, nome_fantasia, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, codigo_municipio_ibge, papeis, observacoes, ativo";

/** Remove caracteres que alteram a sintaxe do filtro `or` do PostgREST. */
export function termoDeBusca(texto: string): string {
  return texto.replace(/[,()*%\\:"]/g, " ").trim().slice(0, 80);
}

export async function listarPessoas(busca: string): Promise<Pessoa[]> {
  let query = supabase.from("pessoas").select(PESSOA_COLUNAS).order("nome").limit(200);
  const termo = termoDeBusca(busca);
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const filtros = [`nome.ilike.*${termo}*`, `nome_fantasia.ilike.*${termo}*`];
    if (digitos.length >= 3) filtros.push(`documento.like.*${digitos}*`);
    query = query.or(filtros.join(","));
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Pessoa[];
}

export async function salvarPessoa(id: string | null, input: PessoaInput): Promise<void> {
  const { error } = id
    ? await supabase.from("pessoas").update(input).eq("id", id)
    : await supabase.from("pessoas").insert(input);
  if (error) throw error;
}

export async function listarOpcoesPessoas(): Promise<Opcao[]> {
  const { data, error } = await supabase.from("pessoas").select("id, nome").eq("ativo", true).order("nome").limit(1000);
  if (error) throw error;
  return (data ?? []) as Opcao[];
}

export async function listarCategorias(tipo: "receita" | "despesa"): Promise<Opcao[]> {
  const { data, error } = await supabase.from("categorias").select("id, nome").eq("tipo", tipo).eq("ativo", true).order("nome");
  if (error) throw error;
  return (data ?? []) as Opcao[];
}

export async function listarContas(): Promise<Opcao[]> {
  const { data, error } = await supabase.from("contas").select("id, nome").eq("ativo", true).order("nome");
  if (error) throw error;
  return (data ?? []) as Opcao[];
}
