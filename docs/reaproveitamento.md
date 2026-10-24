# Reaproveitamento — Etapa 1

Projetos examinados (somente leitura, nenhum arquivo alterado):

* **Neuro Hub Pro** (`gahsantosss16-dev/neuro-hub-pro`, commit `dc4e2c9`)
* **LSB — Manutenção Inteligente** (`gahsantosss16-dev/manuten-o-inteligente`, commit `ed38828`)
* **Gestão Financeira Demo** (este repositório, protótipo estático movido para `demo/`)

Os três pertencem ao mesmo autor; nenhum código de terceiros com licença
restritiva foi copiado (os componentes de interface de origem shadcn/ui são MIT).

## Reaproveitado (copiado e adaptado)

| Origem | Arquivo de origem | Destino | Adaptação |
| --- | --- | --- | --- |
| LSB | `src/lib/documento.ts` + `documento-duplicidade.ts` | `src/lib/documento.ts` | Máscara progressiva CPF/CNPJ, telefone, CEP e validação de dígitos; mesma regra replicada no banco (`documento_valido`) |
| LSB | `src/lib/cep.ts` | `src/lib/cep.ts` | Tipagem sem `any`, timeout, `fetch` injetável para teste; mantém código IBGE (necessário à NFS-e) |
| LSB | `src/lib/consulta-cnpj.ts` | `src/lib/consulta-cnpj.ts` | Igual, com `fetch` injetável; nunca envia CPF |
| LSB | `src/lib/form-enter-guard.ts` | `src/lib/form-enter-guard.ts` | Sem mudança |
| LSB | `tests/p0/*` (PGlite) | `supabase/tests/` | Método de testar migrations, RLS e RPCs em PostgreSQL real com dados sintéticos |
| LSB | migration P0 (operações críticas por RPC) | migration da Etapa 1 | Baixa/estorno/cancelamento só por RPC; colunas protegidas fora do `UPDATE` |
| Neuro Hub Pro | `scripts/assert-supabase-target.mjs` | `scripts/assert-supabase-target.mjs` | Generalizado para dev/QA/produção via `config/supabase-targets.json` + bloqueio de service_role em `VITE_*` |
| Neuro Hub Pro | `src/auth/permissions.ts` | `src/auth/permissions.ts` | Mesma ideia (tabela única de rotas por perfil) com os perfis `admin`/`financeiro`/`consulta` |
| Neuro Hub Pro | `src/auth/session-activity.ts` | `src/auth/session-activity.ts` | Inatividade de 30 min; "sem registro" não derruba a sessão |
| Neuro Hub Pro | `src/auth/redirects.ts` | `src/lib/redirects.ts` | Proteção contra open redirect após login |
| Neuro Hub Pro | `src/components/ui/money-input.tsx` | `src/components/ui/money-input.tsx` | Estado em centavos inteiros |
| Neuro Hub Pro | `src/lib/financePeriod.ts` (lição) | `src/lib/datas.ts` | Datas como dia civil; período cobre o mês inteiro |
| Neuro Hub Pro | `friendlyError` (`services/financial.ts`) | `src/lib/erros.ts` | Tradução de códigos do PostgreSQL, sem vazar mensagem técnica |
| Neuro Hub Pro | migration `financial_module_schema` | migration da Etapa 1 | Função de acesso financeiro `security definer` + RLS, trigger `updated_at`, bloqueio contra corrida |
| Neuro Hub Pro | migration `patient_trash_audit_trail` | `audit_log` | Auditoria imutável (trigger rejeita UPDATE/DELETE), leitura só admin |
| Neuro Hub Pro | `ui/button`, `ui/input`, `ui/card`, `ui-kit/StatCard`, `ui-kit/StatusBadge` | `src/components/ui/` | Versões enxutas, sem Radix |
| Neuro Hub Pro | `hooks/useDebouncedValue.ts` | `src/hooks/useDebouncedValue.ts` | Sem mudança |
| Neuro Hub Pro / LSB | `CLAUDE.md` | `CLAUDE.md` | Regras consolidadas e adaptadas |
| Demo | Paleta verde e creme, layout (menu lateral + navegação inferior no celular), parcelamento com prévia, CSV, situações (em aberto/parcial/quitado/vencido) | `src/styles.css`, `AppLayout`, telas | Transformados em recursos reais ligados ao Supabase |

## Avaliado e não reaproveitado (motivo)

* **`auth-controller.ts` do Neuro Hub Pro (761 linhas)**: inclui passkeys, Master, clínicas e dispositivos autorizados — fora do escopo; foi usado um `AuthProvider` simples sobre o Supabase Auth.
* **TanStack Start + `@lovable.dev/vite-tanstack-config`**: os dois projetos usam SSR via Lovable. Para a ASSOCIAPEC foi escolhido SPA estático (Vite + TanStack Router): hospedagem mais barata, sem servidor Node, sem dependência da Lovable. Regras de servidor ficam no banco (RLS/RPC) e, para a NFS-e, em função de servidor.
* **Fallback de duplicidade do LSB** que baixava as tabelas inteiras para o navegador: substituído por índice único no banco.
* **`.env` versionado** nos dois projetos (com URL/chave pública de produção): não repetido; aqui só `.env.example` entra no Git.
* **Módulo financeiro do Neuro Hub Pro** (recibos/sessões clínicas): regras de negócio diferentes (clínica, paciente, recibo); valor em `numeric` em vez de centavos. Aproveitados só os padrões de segurança.
* **Psique / Bolt, Assessment Engine, ordens de serviço**: específicos daqueles sistemas.
* **Gerador de dados fictícios e simulação de WhatsApp da demo**: permanecem apenas em `demo/`.

## Criado do zero para a ASSOCIAPEC

* Modelo de dados: pessoas (associado/cliente/fornecedor), categorias, contas, lançamentos com parcelas, baixas parciais, estorno, cancelamento, resumo mensal.
* Idempotência ponta a ponta (formulário → banco) para lançamentos, baixas e emissões NFS-e.
* Estrutura da NFS-e: configuração por ambiente, produção desabilitada por padrão, emissões/eventos preservados, uma emissão ativa por lançamento, regras de prontidão sem códigos presumidos.
* Campo com máscara que preserva a posição do cursor (`MaskedInput`).
* CSV com proteção contra injeção de fórmulas.
