# ASSOCIAPEC Financeiro

Sistema de gestão financeira da ASSOCIAPEC: contas a pagar e a receber, cadastro de
associados/clientes/fornecedores, relatórios, perfis e permissões, com integração de
**NFS-e de Campo Grande/MS** planejada desde a arquitetura.

> Regras de desenvolvimento: [`CLAUDE.md`](CLAUDE.md). Reaproveitamento do Neuro Hub Pro
> e do LSB: [`docs/reaproveitamento.md`](docs/reaproveitamento.md).

## Situação (Etapa 1)

| Item | Estado |
| --- | --- |
| Telas (login, painel, a pagar/receber, pessoas, relatórios, NFS-e) | Implementadas; verificadas no navegador com Supabase **simulado** |
| Banco (migration da Etapa 1) | Testada em PostgreSQL local (PGlite). **Ainda não aplicada** em nenhum Supabase |
| Supabase de desenvolvimento/QA/produção | **Não criados** (dependem de autorização) |
| NFS-e | Estrutura e regras de prontidão. **Nenhuma emissão** implementada |
| Importação de planilhas | Etapa futura |

## Stack

Vite 8 · React 19 · TypeScript · TanStack Router/Query · Tailwind CSS 4 · Supabase (Auth + Postgres + RLS) · Vitest + PGlite.
Site estático (SPA): pode ser hospedado em qualquer servidor de arquivos (ex.: `financeiro.associapec.com.br`), sem servidor Node.

## Desenvolvimento

Requer Node 22 e **npm 11** (o npm 10.9 falha ao resolver estas dependências):

```bash
npx -y npm@11 install
cp .env.example .env.local   # preencher com o Supabase de DESENVOLVIMENTO
npm run dev
```

Verificações:

```bash
npm run typecheck && npm run lint && npm test
npm run build      # bloqueia se o ambiente apontar para o Supabase errado
```

### Banco de dados

* Migrations: `supabase/migrations/` — aplicar somente com autorização, primeiro em desenvolvimento.
* Testes do banco: `supabase/tests/` (PostgreSQL real em memória, dados sintéticos).
* Contas novas nascem **inativas** com perfil `consulta`; um administrador libera o acesso em `profiles`.

## Estrutura

```
src/auth/            sessão, perfis e permissões
src/components/      layout e componentes de interface
src/lib/             regras puras (documento, dinheiro, datas, lançamentos, NFS-e…)
src/routes/          telas
src/services/        acesso ao Supabase
supabase/            migrations e testes do banco
scripts/             verificação de ambiente no build
config/              refs públicos do Supabase por ambiente
demo/                protótipo de apresentação (dados fictícios, publicado no GitHub Pages)
```
