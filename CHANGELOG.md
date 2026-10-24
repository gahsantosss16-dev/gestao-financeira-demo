# Changelog

## [Não publicado] — Etapa 1 (2026-10-24)

### Adicionado
- Estrutura inicial do sistema financeiro (Vite + React + TanStack Router + Supabase).
- Login com Supabase Auth, perfis `admin`/`financeiro`/`consulta`, expiração por inatividade.
- Painel, contas a pagar e a receber (parcelamento, baixa parcial, cancelamento), cadastro de pessoas (CPF/CNPJ validado, CEP e CNPJ automáticos), relatório previsto x realizado com CSV.
- Tela de prontidão da NFS-e (sem emissão).
- Migration `20261024000100_etapa1_estrutura_financeira.sql` (não aplicada em nenhum Supabase remoto) com RLS, RPCs atômicas, auditoria imutável e estrutura da NFS-e.
- `CLAUDE.md`, verificação de ambiente no build e CI.

### Alterado
- Protótipo de demonstração movido para `demo/` (publicação no GitHub Pages ajustada para essa pasta).
