# Etapa 1 — Fundação do sistema

Branch: `claude/adoring-allen-3sgfbd` · Data: 24/10/2026

## Entregue

| Item | Situação |
| --- | --- |
| Análise do protótipo | Protótipo estático (HTML/JS, dados no navegador) preservado na raiz. Reaproveitados: design system, padrões de tabela/modal/toast, gráficos SVG, lógica de status/vencimentos. |
| Arquitetura | React 18 + TypeScript + Vite em `app/`; Supabase (Postgres/Auth/Storage/Edge Functions). Ver `ARQUITETURA.md`. |
| Autenticação e perfis | Supabase Auth (e-mail/senha, recuperação de senha, sem cadastro público); 4 perfis com RLS. Modo demonstração com seleção de perfil. |
| Modelo de dados | `supabase/migrations/20261024000001_fundacao.sql` — 14 tabelas, RLS em todas, triggers de auditoria, cálculo de pagamentos e travas fiscais; 2 buckets privados. |
| Layout principal | Menu lateral, topo com indicador de ambiente, tema claro/escuro, navegação inferior no celular, tabelas que viram cartões no celular. |
| Painel | Receitas, despesas, saldo, vencidos, inadimplentes, a receber/pagar, próximos 7 dias, gráfico de 6 meses, filtros por período. |
| Clientes e fornecedores | PF/PJ, validação de CPF/CNPJ, bloqueio de duplicidade, contatos, endereço, dados fiscais, ativar/desativar, busca e filtros, saldos por cadastro. |
| Categorias e serviços | CRUD; serviços com cTribMun/cTribNac/NBS/ISS bloqueados para quem não é Fiscal/Admin e validação da contabilidade. |
| Contas a receber | Lançamento, parcelamento (1–12x), vencimentos, recebimento total/parcial com confirmação, inadimplência (>30 dias), estorno, cancelamento, anexos, filtros (situação, cliente, período, busca), totais. |
| Contas a pagar | Despesas, recorrência mensal/trimestral/anual com geração automática da próxima ocorrência ao quitar, pagamentos, comprovantes em bucket privado. |
| Módulo fiscal (estrutura) | Dados do emitente e metadados do certificado; rascunho de DPS a partir do lançamento; pré-validação; checklist de prontidão; consulta e envio via backend (desabilitados); histórico de solicitações; Edge Function com autorização, segregação de ambientes e log. |
| Administração | Usuários e perfis; auditoria com diferenças antes/depois. |

## Fora do escopo desta etapa (honestamente não implementado)

- **Relatórios/exportação Excel-PDF e importação de planilhas** → Etapa 2 (telas indicam "não disponível").
- **Geração do XML da DPS, validação XSD, assinatura digital e envio real** → Etapa 3. A Edge Function
  responde `501`/`nao_habilitado` e registra a tentativa; nada é simulado como emitido.
- As consultas GET com certificado (mTLS) estão escritas, mas **não foram testadas** contra a prefeitura;
  o mecanismo de autenticação deve ser confirmado na documentação técnica.
- Convite de usuários pela própria aplicação (hoje: painel do Supabase).

## Resultado dos testes

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Unitários + integração da interface (Vitest/jsdom) | `cd app && npm test` | **28/28 aprovados** |
| Tipagem do frontend | `cd app && npm run typecheck` | sem erros |
| Build de produção | `cd app && npm run build` | ok (≈87 kB JS gzip) |
| Banco: migração + RLS + triggers (PostgreSQL 16 local) | `supabase/tests/run.sh` | **32 verificações aprovadas** |
| Edge Function | `deno check supabase/functions/nfse/index.ts` | sem erros |
| Fumaça no navegador (Chromium, desktop 1366px e celular 390px) | Playwright | 11 telas por viewport, recebimento parcial e preparação de DPS executados, **0 erros de console** |

O banco foi testado **somente localmente**; nenhuma migração foi aplicada em Supabase remoto.

## Pendências que dependem da ASSOCIAPEC / contabilidade

1. **Documentação do Works indisponível neste ambiente**: o arquivo
   `C:\Users\GABRIEL SANTOS\.codex\visualizations\2026\10\24\01a16e68-f034-7a10-93ec-b142d2ad3417\auditoria_nfse_associapec.md`
   está na máquina local e não foi acessível na sessão em nuvem. A Etapa 1 seguiu os requisitos da tarefa
   (URLs, endpoints, cTribMun obrigatório). Para a Etapa 3, incluir no repositório (ex.: `docs/fiscal/`)
   o relatório, os XSD e os anexos de layout v1.00/v1.01.
2. Certificado digital: tipo (A1/A3), validade e titularidade. **A3 normalmente não funciona em servidor em nuvem.**
3. Códigos `cTribMun` (tabela SEFAZ, 209 páginas) por serviço prestado, validados pela contabilidade.
4. Dados cadastrais fiscais da ASSOCIAPEC (CNPJ, inscrição municipal, regime, série da DPS).
5. Autorização para criar/usar o projeto Supabase (plano gratuito) e aplicar a migração.
6. Definição de domínio/hospedagem (arquitetura já compatível com `financeiro.associapec.com.br`).

## Roteiro de homologação da Etapa 1

```bash
cd app && npm install && npm run dev     # abre em modo demonstração
```
1. Entrar como **Financeiro**: cadastrar cliente (testar CNPJ inválido e duplicado), lançar receita parcelada,
   registrar recebimento parcial, anexar comprovante, lançar despesa recorrente e quitá-la (próxima ocorrência é criada).
2. Entrar como **Consulta**: confirmar que não há botões de inclusão/edição.
3. Entrar como **Fiscal**: preencher Dados fiscais, cadastrar cTribMun de teste num serviço e validar,
   criar DPS a partir de um lançamento, pré-validar, enviar → mensagem "não habilitado" + registro no histórico.
4. Entrar como **Administrador**: alterar perfis (com Supabase), ver auditoria, estornar pagamento.
5. Repetir no celular (menu inferior, tabelas em cartões).
