# Etapa 2 — Operação financeira (em homologação)

Branch: `claude/adoring-allen-3sgfbd` · 25/10/2026

## Situação do banco

| Item | Situação |
| --- | --- |
| Usuário `financeiroassociapec@gmail.com` | **Promovido a Administrador** (autorizado). Confirmado no banco: `current_app_role = admin`, vê auditoria e dados fiscais. |
| Migração `20261025000001_operacional.sql` | **Criada e validada localmente — NÃO aplicada** no Supabase. Aguarda autorização específica. |
| Dados no banco real | Nenhum (0 cadastros, 0 contas, 0 categorias). `seed.sql` (categorias) não aplicado. |

Enquanto a migração não for aplicada, o app detecta a versão do banco e mostra
"atualização pendente" em **Cobranças** e **Importação**; cadastros e contas
continuam funcionando (IE principal gravada no campo existente; estorno antigo,
somente administrador). Nada quebra no ambiente publicado.

## O que já existia e estava oculto pelo perfil Consulta

Com perfil Consulta o usuário só via leitura. Já estavam implementados desde a Etapa 1:
cadastro e edição de clientes/fornecedores, inativação, categorias e serviços, novas
contas a receber/pagar (parcelamento, recorrência), baixa total e parcial, cancelamento,
anexos de comprovantes, exclusão (admin), estorno (admin), dados fiscais, rascunhos de
DPS, usuários e perfis e auditoria. Esses recursos não foram recriados.

## Corrigido / evoluído

- **Estorno** passa a exigir justificativa e **não apaga** o pagamento (fica no histórico, riscado, com motivo, data e autor).
- **Baixas duplicadas**: identificador único por envio (duplo clique), aviso de pagamento igual já registrado e **trava de linha no banco** contra baixas simultâneas (teste de concorrência real; controle negativo comprova a falha sem a trava).
- Conta com pagamentos não pode ser excluída (usar cancelamento).
- Painel ignora pagamentos estornados; indicadores levam aos registros correspondentes.
- Unicidade de categorias e serviços sem diferenciar maiúsculas/espaços.
- Usuário não altera o próprio e-mail pelo perfil (só nome).
- Dependências: corrigidas vulnerabilidades do roteador e do `@supabase/auth-js` (atualização dentro da mesma versão principal).

## Implementado

| Módulo | Recursos |
| --- | --- |
| **Cadastro** | IE em destaque no topo (UF, IE, Consultar IE, CPF/CNPJ, nome); produtor rural; várias propriedades/IEs por produtor (UF + IE únicos); validação de IE das 27 UFs; alerta de duplicidade (IE, CPF/CNPJ, raiz de CNPJ, nome parecido) com "abrir cadastro existente"; consulta pública de CNPJ (preenche só campos vazios, sugere IEs vinculadas) e de CEP; máscaras com cursor preservado; histórico de alterações (admin); vínculo com contas e cobranças. |
| **Consulta de IE** | Assistida: copia a IE e abre SINTEGRA/CCC; registra situação e data. Não há API oficial gratuita aberta (portais com CAPTCHA). Consulta automática futura: serviço oficial de consulta cadastral da SEFAZ com o certificado da ASSOCIAPEC, via backend. |
| **Contas a receber/pagar** | Baixa total/parcial compartilhada, estorno justificado, vínculo com IE/propriedade, filtro por cliente vindo de outras telas, "Gerar cobrança". |
| **Cobranças** | Código `COB-AAAA-NNNNN` (sequência com trava, padrão Neuro Hub Pro), uma cobrança ativa por conta, situação derivada da conta (pendente, parcial, paga, vencida, cancelada), baixa pela cobrança, observações, registro manual de contatos (prepara notificações), cancelamento justificado, **demonstrativo PDF** com identidade da ASSOCIAPEC e aviso de que não é boleto. |
| **Importação de planilhas** | Excel (.xlsx) e CSV; mapeamento sugerido por sinônimos e lembrado por cabeçalho; prévia sem gravar (novo, encontrado, revisar, já importado, erro); associação por UF+IE → CPF/CNPJ → nome (nome sozinho sempre pede confirmação); conflitos IE×CPF pedem decisão; atualização controlada (completa vazios ou atualiza divergentes, nunca apaga); contas e cobranças sem duplicar (`import_key` única); lote + linha de origem registrados; relatório de erros em CSV; histórico. Layout oficial do Estado **ainda não homologado** (aguarda arquivo real). |
| **Topbar / Meu Perfil** | Avatar, nome e perfil na Topbar; menu com Meu Perfil e Sair (padrão Neuro Hub Pro); identificação removida do rodapé do menu; Meu Perfil com nome editável, e-mail e perfil somente leitura, troca de senha conferindo a senha atual (padrão LSB), encerrar sessão. |
| **Identidade visual** | Login institucional reformulado; espaço para a logomarca oficial (`app/public/brand/`) com recurso textual enquanto o arquivo não é publicado; PDFs com cabeçalho/rodapé institucionais e logo quando disponível. |

## Reaproveitamento efetivo (somente leitura dos projetos de origem)

| Origem | Arquivo de origem | Uso no Financeiro |
| --- | --- | --- |
| LSB | `src/lib/consulta-cnpj.ts` | `lib/lookups.ts` (BrasilAPI + reserva cnpj.ws, mensagens de erro, nunca envia CPF) |
| LSB | `src/lib/cep.ts` | `lookupCep` (ViaCEP + BrasilAPI) |
| LSB | `src/lib/documento.ts` | máscaras progressivas de CPF/CNPJ, telefone, CEP |
| LSB | `src/components/ui/input.tsx` (`numericMaskCaret`) | `components/TextInput.tsx` — cursor não pula |
| LSB | `src/lib/documento-duplicidade.ts` | alerta de mesma raiz de CNPJ |
| LSB | `account-dialogs.tsx` (`AlterarSenhaDialog`) | troca de senha confirmando a atual |
| Neuro Hub Pro | `components/layout/Topbar.tsx` | menu do usuário, `getInitials`, "Encerrando sessão…" |
| Neuro Hub Pro | `lib/patientExcelImport.ts` | ExcelJS, `normalizeName`, classificação da prévia |
| Neuro Hub Pro | `spellcheck/correction-policy.ts` | `editDistance` (nomes parecidos) |
| Neuro Hub Pro | migração `financial_module_schema` | numeração sequencial com trava consultiva + `unique` |
| Protótipo | `js/app.js` / `jspdf` | jsPDF (mesma biblioteca de LSB e Neuro) para PDFs |

Os componentes visuais (shadcn/Tailwind) dos dois projetos não foram copiados: a stack
do Financeiro é React + CSS próprio; foram portadas as soluções e regras, não a identidade.

## Testes

| Suíte | Resultado |
| --- | --- |
| Vitest (unitários + integração de interface) | **149 aprovados** |
| Banco local (migrações 1+2, RLS, permissões reais, triggers) | **92 verificações + teste de concorrência** |
| TypeScript / build | sem erros |
| Navegador (Chromium, 1366px e 390px) | login, painel, menu, cadastro, cobrança, importação, perfil; **0 erros de console**; persistência após fechar e reabrir |
| Banco real (somente leitura) | perfil admin confirmado |

Cenários cobertos: cadastro de cliente e fornecedor, edição sem perda, duplicidade (IE e
CNPJ), conta a receber e a pagar, baixa total e parcial, estorno, cancelamento, painel
atualizado, permissões (consulta/financeiro/admin), alteração de nome, alteração de senha
(Supabase simulado), navegação responsiva, persistência, duplo clique e concorrência no banco.

## Pendências reais

1. **Autorizar a aplicação da migração `operacional`** no projeto `cpepbgyycnbbfvtbzkgk` (libera cobranças, importação, múltiplas IEs e estornos justificados no ambiente publicado).
2. **Arquivos da logomarca** em `app/public/brand/` (`associapec-logo.png` e `associapec-logo-transparente.png`) — enviados na conversa, mas não acessíveis ao ambiente de desenvolvimento.
3. **Planilha real do Estado** para homologar o mapeamento definitivo.
4. Categorias iniciais no banco real (`seed.sql`) — aplicar com autorização.
5. Relatórios e exportações (Excel/PDF) — próxima etapa.
6. React Router 6 tem alerta moderado só corrigido na v7 (afeta links com destino vindo do usuário, que o app não usa).
7. Consulta automática de IE depende do certificado digital (Etapa 3).
