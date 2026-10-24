# Arquitetura — Sistema de Gestão Financeira ASSOCIAPEC

> Etapa 1 (fundação). Para o que foi entregue e o resultado dos testes, veja [`ETAPA-1.md`](ETAPA-1.md).

## Visão geral

```
 Navegador (React + TypeScript, SPA estática)
   │  Supabase JS (somente URL + chave pública anon)
   ▼
 Supabase
   ├── Auth ............ login por e-mail/senha, sem cadastro público
   ├── PostgreSQL ...... tabelas + RLS + triggers (regras e auditoria no banco)
   ├── Storage ......... buckets PRIVADOS: comprovantes, fiscal-xml
   └── Edge Function `nfse` (Deno) ── certificado digital em secrets
                                        │  mTLS / HTTPS
                                        ▼
                         API NFS-e Campo Grande/MS
                         homologação: https://nfse2-cgr.dsfweb.com.br
                         produção:    https://nfseapi.campogrande.ms.gov.br (bloqueada)
```

**Princípio:** o frontend nunca é a barreira de segurança. Permissões, cálculo de valores pagos,
travas fiscais e auditoria são garantidos pelo PostgreSQL (RLS + triggers). A interface apenas
esconde o que o perfil não pode fazer.

## Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| `index.html`, `css/`, `js/` | **Protótipo original** (Recebe Fácil) — preservado sem alterações |
| `app/` | Aplicação React + TypeScript + Vite |
| `app/src/lib/` | Regras de domínio puras e testadas (status, painel, CPF/CNPJ, permissões) |
| `app/src/data/` | Camada de dados: `SupabaseSource` (real) e `DemoSource` (demonstração) |
| `app/src/pages/` | Telas |
| `supabase/migrations/` | Modelo de dados, RLS, triggers, storage |
| `supabase/functions/nfse/` | Backend fiscal (Edge Function) |
| `supabase/functions/_shared/` | Endpoints NFS-e e pré-validação da DPS (usados pelo backend e pela interface) |
| `supabase/tests/` | Testes do banco em Postgres local descartável |

O design system (paleta verde/creme, cards, tabelas responsivas, modais) foi herdado do protótipo
(`app/src/styles/base.css`), assim como o padrão de gráficos SVG sem dependências.

## Modos de execução

| Modo | Quando | Dados |
| --- | --- | --- |
| **Demonstração** | `VITE_SUPABASE_URL` não definido | Fictícios, no `localStorage` do navegador. `DemoSource` reproduz as mesmas regras do banco (permissões, pagamentos, unicidade, travas fiscais, auditoria). |
| **Supabase** | `.env.local` com URL e chave anon do projeto autorizado | Banco real com RLS |

## Perfis de acesso

| Perfil | Cadastros | Financeiro | Serviços (dados tributários) | Fiscal | Usuários / auditoria |
| --- | --- | --- | --- | --- | --- |
| Administrador | escreve / exclui | escreve / exclui / estorna | sim | sim | sim |
| Financeiro | escreve | escreve | não (só dados comerciais) | lê dados fiscais | não |
| Fiscal | lê | lê | sim | rascunhos, pré-validação, envio | não |
| Consulta | lê | lê | não | lê documentos | não |

- Novo usuário do Auth recebe automaticamente o perfil **Consulta** (trigger `handle_new_user`).
- Ninguém altera o próprio papel; somente administradores alteram papéis e desativam usuários.
- Exclusões são restritas ao administrador; o fluxo normal é **cancelar** (mantém histórico).

## Modelo de dados (resumo)

- `profiles` — perfil de cada usuário do Auth.
- `parties` — clientes **e** fornecedores (PF/PJ), CPF/CNPJ **único** (evita duplicidade), contatos, endereço, IBGE, inscrições.
- `categories` (receita/despesa), `services` (catálogo + `c_trib_mun`, `c_trib_nac`, `nbs`, `iss_rate`, validação da contabilidade).
- `receivables` / `receivable_payments`, `payables` / `payable_payments` — `paid_amount` é **calculado por trigger**
  a partir dos pagamentos; o banco recusa pagamento acima do saldo, pagamento em conta cancelada e alteração manual de `paid_amount`.
- `payables.recurrence` + `recurrence_parent_id` com índice único (não gera a mesma ocorrência duas vezes).
- `attachments` — metadados; arquivo no bucket privado `comprovantes` (URLs assinadas de 2 minutos).
- `audit_log` — trigger genérico em todas as tabelas de negócio (quem, quando, antes/depois).
- Fiscal: `fiscal_issuer` (uma linha por ambiente; certificado = **apenas metadados**), `nfse_documents`
  (vínculo com `receivables`), `nfse_requests` (histórico de solicitações/respostas/erros), `nfse_events`.

## Segurança fiscal

- Certificado, senha e chave privada **somente** como secrets da Edge Function (`supabase secrets set`).
  `.gitignore` bloqueia `*.pfx`, `*.p12`, `*.pem`, `*.key` e `.env*`.
- Usuários só criam documentos em **homologação** e só nos status `rascunho`/`validada`.
  Status posteriores, chave de acesso, caminhos de XML e registros de produção só podem ser gravados
  pelo backend (`service_role`) — trigger `guard_nfse_document`.
- `nfse_requests` e o bucket `fiscal-xml` não aceitam escrita de usuários.
- Produção exige o secret `NFSE_PRODUCTION_ENABLED=true` (não definido) e a integração inteira exige
  `NFSE_INTEGRATION_ENABLED=true` (não definido). Sem eles, a função registra a tentativa e responde
  `nao_habilitado` — **nenhuma emissão é simulada**.
- O `cTribMun` é obrigatório: um serviço só fica "validado" com código preenchido e responsável informado;
  alterar o código derruba a validação. O sistema **não sugere** códigos, alíquotas ou regras.

## Domínio e hospedagem

O build é estático, com caminhos relativos (`base: './'`) e rotas por hash, portanto funciona em
qualquer hospedagem estática e em `financeiro.associapec.com.br` sem reconfiguração. Ao definir o domínio:
1. Adicionar a URL em *Supabase → Authentication → URL Configuration* (já prevista em `supabase/config.toml`).
2. Definir o secret `ALLOWED_ORIGIN=https://financeiro.associapec.com.br` na Edge Function.

## Implantação

### Situação atual (24/10/2026)

| Item | Situação |
| --- | --- |
| Projeto Supabase | `cpepbgyycnbbfvtbzkgk` (org. `financeiro-associapec`) — `https://cpepbgyycnbbfvtbzkgk.supabase.co` |
| Migração `fundacao` | **Aplicada** (versão `20261024175942`) |
| Verificador de segurança | 0 alertas |
| Verificador de desempenho | apenas "índice não usado" (INFO), esperado com o banco vazio |
| Dados | nenhum dado pessoal; só as 2 linhas vazias de `fiscal_issuer` |
| Usuários | nenhum (o primeiro deve ser convidado pelo painel) |
| Edge Function `nfse` | **não publicada** |
| `seed.sql` | **não aplicado** (opcional) |

### Modelo de permissões do projeto

Neste projeto, tabelas e funções criadas pelo `postgres` **não** recebem privilégios automáticos
para `anon`/`authenticated` (só TRUNCATE/REFERENCES/TRIGGER, que a migração revoga). Por isso:

- a migração concede **explicitamente** apenas as operações de cada tabela (ver seção "Permissões
  explícitas" no SQL); `anon` não recebe nenhum privilégio;
- toda migração futura que criar tabela **deve** incluir seus `grant`s e políticas RLS;
- funções internas ficam no schema `private` (fora da Data API). Só `private.has_role` e
  `private.current_app_role` são executáveis por `authenticated` (as políticas RLS precisam delas);
  funções de trigger não precisam de `EXECUTE` para disparar;
- `public.rls_auto_enable()` (do Supabase) segue ativando RLS em tabelas novas via event trigger
  `ensure_rls`, mas não é mais chamável pela API.

O teste local (`supabase/tests/supabase_stub.sql`) reproduz esse modelo; não adicione grants no stub.

### Próximos passos para ligar o app

1. Painel → *Authentication → Sign In / Providers*: desativar cadastro público (*Allow new users to sign up*).
2. Painel → *Authentication → URL Configuration*: Site URL do ambiente de homologação.
3. Convidar o primeiro usuário (*Authentication → Users → Invite*). Ele entra como **Consulta**.
4. Promover a administrador (SQL Editor, com autorização):
   `update public.profiles set role = 'admin' where email = '<e-mail>';`
5. `app/.env.local` com `VITE_SUPABASE_URL` e a chave **publishable/anon** do projeto; `npm run dev`.
6. Edge Function `nfse` e secrets: somente na Etapa 3.
