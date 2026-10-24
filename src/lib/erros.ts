// Adaptado de friendlyError (Neuro Hub Pro, src/services/financial.ts):
// traduz códigos do PostgreSQL/PostgREST em mensagens claras.
type ErroBanco = { code?: string; message?: string } | null | undefined;

export function mensagemDeErro(error: ErroBanco, fallback = "Não foi possível concluir a operação."): string {
  if (!error) return fallback;
  if (error.code === "23505") {
    if (error.message?.includes("pessoas_documento_unico")) return "Já existe um cadastro com este CPF/CNPJ.";
    return "Este registro já foi salvo anteriormente.";
  }
  if (error.code === "23503") return "O registro está vinculado a outros dados.";
  if (error.code === "23514") return "Algum campo não passou na validação. Revise os dados informados.";
  if (error.code === "42501") {
    // Mensagens escritas em português pelas próprias funções do banco.
    if (error.message && /[ãçéêíóúà]/i.test(error.message)) return error.message;
    return "Você não possui permissão para realizar esta operação.";
  }
  if (error.code === "22023" || error.code === "P0002") return error.message || fallback;
  return fallback;
}
