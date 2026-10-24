# CLAUDE.md — ASSOCIAPEC Financeiro

Regras permanentes de desenvolvimento do **sistema financeiro da ASSOCIAPEC**
(contas a pagar e a receber, relatórios, perfis e permissões, NFS-e de Campo
Grande/MS). Valem para qualquer pessoa ou agente de IA que trabalhe neste
repositório, salvo instrução explícita do usuário para uma tarefa específica.

Consolidado a partir das regras já testadas no **Neuro Hub Pro** e no **LSB —
Manutenção Inteligente**, adaptadas às particularidades da ASSOCIAPEC.

---

## 0. Proteção deste arquivo

* Não modificar, reescrever, resumir ou apagar regras deste arquivo por iniciativa própria nem como efeito colateral de outra tarefa.
* Alterações somente com autorização explícita do usuário para alterar o `CLAUDE.md`.
* Se uma situação sugerir uma regra nova, **informar ao usuário e pedir autorização** antes de registrá-la.
* Instruções dadas para uma tarefa valem para aquela tarefa e não entram aqui automaticamente.

---

## 1. Princípio geral

Prioridades, nesta ordem:

1. preservar dados financeiros e funcionalidades já homologadas;
2. evitar regressões;
3. implementar somente o escopo solicitado;
4. reutilizar a arquitetura existente, com a solução mais simples que funcione corretamente;
5. manter rastreabilidade e possibilidade de rollback.

Em caso de conflito entre concluir uma tarefa e preservar um sistema funcional, **preservar o sistema**.
Na dúvida que possa causar perda de dados, regressão ou trabalho descartável: **parar, explicar e pedir autorização**.

---

## 2. Governança de desenvolvimento

* Trabalhar em **etapas pequenas e verificáveis**; cada etapa termina com evidência (testes, build, telas).
* **Não alterar funcionalidades fora do escopo solicitado.** Problema encontrado fora do escopo: relatar, não corrigir sozinho.
* Não executar modificações destrutivas sem autorização (dados, migrations, histórico Git, arquivos do usuário).
* Não substituir implementações funcionais sem justificativa técnica apresentada antes.
* **Não introduzir dependências, serviços ou ferramentas pagas sem aprovação.** Dependência gratuita nova também precisa de justificativa.
* Corrigir a **causa** dos problemas, não o sintoma; não mascarar regressão com hardcode ou correção só para o registro que revelou o problema.
* **Não declarar tarefa concluída sem evidência.** Diferenciar sempre: ✅ confirmado (executado), ⚠ hipótese, ❓ precisa investigar.
* Evitar auditorias repetitivas: reutilizar diagnósticos, arquivos já lidos e resultados já obtidos. Investigação proporcional ao problema (evidência → causa comprovada → solução mínima → validação). Se uma investigação curta não resolver, parar e reportar o que foi comprovado, o que falta e a ação mínima proposta.
* Mesma função, mesmo comportamento: um padrão compartilhado (tabela, modal, filtro, badge, formatação de valor) deve se comportar igual em todas as telas; corrigir na origem compartilhada.

---

## 3. Git e versionamento

* Branches organizadas: `main` (produção), `qa` (homologação) e branches de trabalho (`feat/…`, `fix/…`, `claude/…`).
* Antes de alterar arquivos: `git status --short`, `git branch --show-current`, `git log -1 --oneline`. Nunca descartar trabalho existente.
* Commits descritivos, em português, um assunto por commit.
* Fazer **push** das alterações para a branch de trabalho.
* Fluxo permanente: **alteração → validação técnica → commit → push → homologação → merge → tag → push da tag**.
* **Tag somente após homologação**, apontando exatamente para o commit homologado (`git push origin <tag>`). Nunca mover, sobrescrever ou reutilizar tags. Se a homologação falhar, não criar tag.
* **Nunca deixar uma tarefa homologada sem commit, push e tag.** Verificar a existência remota da tag; não presumir.
* Preservar o histórico: proibido `git push --force`, `git reset --hard`, `git clean`, `git checkout .` ou rebase de histórico publicado sem autorização explícita.
* Conflitos são resolvidos preservando ambos os lados com critério, nunca por sobrescrita cega.
* Registrar versões e mudanças relevantes em `CHANGELOG.md`.

---

## 4. Ambientes

* **Desenvolvimento, QA e produção são separados**, cada um com seu próprio projeto Supabase. Nenhum banco é compartilhado entre ambientes nem com outros sistemas (Neuro Hub Pro, LSB, aplicação atual da ASSOCIAPEC).
* Os refs públicos de cada ambiente ficam em `config/supabase-targets.json`; `scripts/assert-supabase-target.mjs` **bloqueia o build** quando o ambiente aponta para o Supabase de outro ambiente ou quando há chave secreta em variável `VITE_`.
* Variáveis reais ficam em `.env.local` / painel de hospedagem, **nunca versionadas** (`.env.example` é o único arquivo de ambiente no Git).
* Preservar as configurações específicas de cada ambiente ao sincronizar branches.
* **QA não deve gerar custos desnecessários** nem executar automações ou serviços pagos destinados à produção. NFS-e em QA usa somente o ambiente de homologação da prefeitura.
* Sincronizar `main` e `qa` após homologação, sem sobrescrever configurações próprias de cada ambiente.
* **Nunca publicar em produção sem autorização** do usuário.
* Hospedagem futura prevista: `financeiro.associapec.com.br`. **Não alterar a infraestrutura, o domínio ou a aplicação já existente da ASSOCIAPEC.**

---

## 5. Supabase

* **Supabase é obrigatório** como banco de dados e autenticação.
* Toda tabela em `public` com **RLS habilitada**; privilégios explícitos (`revoke all` + `grant` mínimo). Nunca relaxar RLS/policies para "fazer funcionar".
* **Princípio do menor privilégio**: conta nova nasce `consulta` e inativa; somente admin libera acesso. Colunas sensíveis (status, valor pago, cancelamento, validação fiscal) ficam fora do `UPDATE` direto do cliente.
* **Nunca expor service role key** (ou `sb_secret_…`) no frontend. O cliente usa apenas a chave pública anon/publishable.
* Operações críticas (baixa, estorno, cancelamento) só por **RPC atômica** `security definer` com `set search_path`, validação de permissão dentro da função e bloqueio de linha.
* Migrations sempre versionadas em `supabase/migrations/` e testadas localmente em PostgreSQL real (`supabase/tests/`, PGlite) antes de qualquer aplicação.
* **Não aplicar migrations em Supabase remoto sem autorização explícita** do usuário. **Não executar migrações destrutivas** (drop, truncate, delete em massa, alteração de tipo com perda) sem autorização.
* **Não alterar dados reais sem aprovação.** Testes usam somente dados sintéticos.
* Manter backups e plano de recuperação documentados antes de ir para produção (backup diário do provedor + exportação antes de migrations relevantes).

---

## 6. Segurança financeira

* Proteger informações pessoais (LGPD) e financeiras: nada de dados reais em testes, logs, commits ou capturas de tela.
* Autenticação obrigatória para qualquer dado; autorização por perfil (`admin`, `financeiro`, `consulta`) validada **no banco**; a interface apenas esconde o que o perfil não pode usar.
* **Registrar operações financeiras relevantes** na trilha de auditoria imutável (`audit_log`).
* **Evitar duplicidade**: chave de idempotência em lançamentos, baixas e emissões; CPF/CNPJ único; reenvio do mesmo formulário não duplica.
* **Prevenir alterações indevidas em pagamentos**: nada é apagado (lançamento é cancelado com motivo, baixa é estornada com motivo); valor de lançamento com baixa não muda.
* **Operações concorrentes**: `select … for update` / advisory lock nas RPCs; constraints únicas como rede de segurança final.
* **Validar dados no servidor** (constraints, funções do banco). A validação do navegador é só para orientar o usuário.
* Valores monetários **sempre em centavos inteiros** (`bigint`), nunca `float`.
* **Não armazenar certificados digitais, senhas ou chaves privadas no frontend** nem no banco em texto; ficam no cofre de segredos da função de servidor.
* Exportações CSV neutralizam fórmulas (CSV injection).

---

## 7. Integração NFS-e (Campo Grande/MS)

* Utilizar a **API oficial da Prefeitura de Campo Grande** (padrão nacional DPS), conforme a documentação vigente — confirmar endpoints e versões na documentação oficial antes de implementar.
* **Homologação e produção separadas** (`nfse_configuracao` por ambiente). Fora do sistema de produção, somente homologação.
* **Nunca enviar nota fiscal real durante testes.**
* **Validar DPS e XMLs contra os XSD oficiais** antes do envio.
* **Assinatura digital** somente em função de servidor; certificado nunca no navegador.
* **Preservar XMLs enviados, retornos e protocolos fiscais** (`nfse_emissoes`), sem apagar.
* **Registrar rejeições e eventos** (`nfse_eventos`, imutável).
* **Não inventar códigos tributários**, alíquotas, itens de serviço ou regimes: campo vazio é pendência, nunca valor padrão. Dados fiscais são informados e validados pela contabilidade.
* **Exigir configuração fiscal validada**; qualquer alteração fiscal invalida a validação anterior.
* **Evitar emissão duplicada por falha de comunicação**: no máximo uma emissão ativa por lançamento e ambiente; chave de idempotência; antes de reenviar, consultar a situação na prefeitura.
* **Não habilitar produção fiscal sem testes em homologação e autorização** explícita do usuário (`producao_habilitada` não é editável pelo cliente).

---

## 8. Qualidade

* Antes de entregar: `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` (com variáveis de desenvolvimento). Falha preexistente é identificada como preexistente, com evidência.
* Corrigir regressões antes da publicação; testar os fluxos homologados que dependem do que foi alterado (não regressão), não só o código novo.
* **Testar permissões e isolamento de dados** (testes de RLS em `supabase/tests/`).
* Testar interfaces responsivas (desktop e celular) no navegador antes de declarar a tela pronta.
* **Documentar limitações reais** no relatório da tarefa.
* **Telas demonstrativas não são funcionalidades concluídas** (a pasta `demo/` é apenas o protótipo de apresentação, com dados fictícios).
* **Não declarar uma integração funcionando sem o teste real correspondente** (ex.: NFS-e só "funciona" após emissão aceita em homologação).
* Não afirmar validação visual sem execução real no navegador.

---

## 9. Interface

* Identidade visual consistente (paleta verde e creme, tokens em `src/styles.css`); reutilizar `src/components/ui/`.
* Acessibilidade e legibilidade: rótulos ligados aos campos, foco visível, contraste, mensagens com `role="alert"`.
* Componentes reutilizáveis em vez de cópias por tela.
* **Formulários não podem perder dados ao editar**: estado único por formulário; consultas automáticas (CEP, CNPJ) só preenchem campos vazios.
* **Preservar a posição do cursor durante a digitação**: máscaras aplicadas sobre os dígitos do estado, sem reformatar o campo de forma que mova o cursor; nunca recriar componentes de input a cada tecla.
* Enter em campo de texto não envia o formulário (`bloquearEnterComoSubmit`).
* Pesquisas eficientes: debounce, filtro no servidor, limites de resultado, sem baixar tabelas inteiras para o navegador.
* Mensagens claras de erro e sucesso, em português, sem expor detalhes técnicos.

---

## 10. Regras específicas da ASSOCIAPEC

* Sistema financeiro **independente** da aplicação atual da associação; sem dependência de código ou banco de outros sistemas.
* Custos operacionais reduzidos: preferir serviços gratuitos ou já contratados; qualquer custo novo exige aprovação.
* Dados financeiros estruturados para alimentar a emissão fiscal (tomador com documento e código IBGE do município).
* Importação futura das planilhas existentes: sempre com prévia, validação, detecção de duplicidade e confirmação antes de gravar.
* Reaproveitamento do Neuro Hub Pro e do LSB: consultar pontualmente soluções já homologadas antes de reconstruir; copiar somente código compatível, sem credenciais, configurações de produção ou dados pessoais; **nunca alterar os projetos de origem**. O registro do que foi reaproveitado está em `docs/reaproveitamento.md`.

---

## 11. Comunicação ao final de cada tarefa

Informar de forma objetiva: o que foi feito, arquivos alterados, validações executadas e resultados, riscos/limitações reais e o que o usuário precisa homologar. Distinguir teste da implementação nova e teste de não regressão.

---

## Regra final

**Preservar o que funciona, alterar somente o necessário, validar antes de fechar e nunca arriscar dados financeiros ou fiscais reais.**
