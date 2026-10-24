# CLAUDE.md — Financeiro ASSOCIAPEC

Sistema de gestão financeira da ASSOCIAPEC (React + TypeScript + Supabase) com estrutura para NFS-e de
Campo Grande/MS. Leia `docs/ARQUITETURA.md`, `docs/ETAPA-1.md` e `docs/ETAPA-2.md` antes de mudanças relevantes.

## Estrutura
- `index.html`, `css/`, `js/` — protótipo original: **não modificar**.
- `app/` — aplicação (Vite). `app/src/lib` regras puras; `app/src/data` (`SupabaseSource` real e
  `DemoSource`, que espelha as regras do banco — mantenha os dois coerentes).
- `supabase/migrations` — fonte da verdade do banco. `supabase/functions/nfse` — backend fiscal.

## Comandos
```bash
cd app && npm test && npm run typecheck && npm run build
supabase/tests/run.sh     # migração + RLS + permissões num Postgres local descartável
```
Rode tudo antes de cada commit. A Edge Function pode ser checada com `deno check supabase/functions/nfse/index.ts`.

## Supabase
- Projeto **único** autorizado: `cpepbgyycnbbfvtbzkgk` (org. `financeiro-associapec`), via conector
  *Supabase ASSOCIAPEC*. Confirme o Project ID antes de qualquer operação. Não criar outro projeto,
  não mexer em outros projetos, não habilitar serviços pagos.
- Migração `fundacao` aplicada. Migração `operacional` (20261025000001) **criada e testada, NÃO aplicada**:
  aguarda autorização específica. O app detecta a versão (`schemaVersion`/`useSchemaV2`) e mantém o
  ambiente publicado funcionando sem ela — preserve esse comportamento enquanto ela não for aplicada.
- Mudanças de banco = **nova** migração em `supabase/migrations`, testada localmente
  (`supabase/tests/run.sh`, inclusive concorrência) e aplicada somente com autorização explícita.
- Operações financeiras: pagamentos são imutáveis; estorno = `reversal_reason` (≥ 5 caracteres), nunca DELETE;
  baixa envia `client_request_id`; o banco trava a conta (FOR UPDATE) ao somar pagamentos.
- O projeto não concede privilégios automáticos: toda tabela nova precisa de `grant` explícito
  (nunca para `anon`), RLS e políticas usando `(select private.has_role(...))`. Funções internas
  vão no schema `private`. O stub de teste reproduz isso — não adicione grants nele.
- Links de e-mail do Auth são tratados em `app/src/auth/authRedirect.ts` (antes do HashRouter); mantenha
  `detectSessionInUrl: false`. Site URL de desenvolvimento: `http://localhost:5173` (porta fixa no Vite).
- Usuário `financeiroassociapec@gmail.com` é Administrador (promoção autorizada em 25/10/2026).
- Não criar/promover usuários, não importar dados pessoais reais e não escrever no banco sem autorização.

## Cadastro, IE e importação
- Identificação de produtores: **UF + Inscrição Estadual** (tabela `party_registrations`, várias por pessoa),
  depois CPF/CNPJ; nome é apenas auxiliar e, sozinho, sempre exige confirmação humana.
- IE validada por `app/src/lib/ie.ts` (27 UFs). Consulta online de IE: só assistida (portais com CAPTCHA);
  não simular consulta. Automática apenas via serviço oficial da SEFAZ com certificado, no backend.
- Consultas públicas gratuitas (BrasilAPI/cnpj.ws/ViaCEP) só sob demanda, preenchendo campos vazios; CPF nunca é enviado.
- Importador (`lib/importer.ts`, `lib/importCommit.ts`): nunca apagar dados com campo vazio; prévia antes de gravar;
  `import_key` evita lançamentos duplicados; não inventar o layout oficial das planilhas do Estado.
- Campos com máscara usam `TextInput numericMaskCaret` (correção de cursor do LSB).

## Identidade visual oficial
- Logomarca oficial: `app/public/brand/associapec-logo.png` (fundo claro) e `associapec-logo-transparente.png`.
  Use os arquivos originais; **não redesenhe, não altere animais, letras ou cores, preserve proporções**.
  Enquanto não existirem, `BrandLogo` mostra a marca textual (nunca uma recriação).
- Paleta: verde institucional `#1b7f37`, verde escuro `#0e3b2e`, fundo creme `#f7f5ec` (tokens em `styles/base.css`).
  Ao receber a logo, conferir os verdes exatos do arquivo e ajustar os tokens se necessário.
- Documentos PDF: usar `createBrandedDoc` (`lib/pdf.ts`) — cabeçalho com logo/nome, rodapé com data e página.
  Demonstrativos de cobrança nunca devem parecer boleto (sem código de barras/Pix).
- Usuário logado fica na Topbar (`UserMenu`); o menu lateral é só navegação.

## Reaproveitamento
- Projetos de referência (somente leitura, nunca alterar): Neuro Hub Pro (`gahsantosss16-dev/neuro-hub-pro`)
  e LSB (`gahsantosss16-dev/manuten-o-inteligente`). Antes de criar algo, procurar equivalente neles;
  portar a solução/regra, não a identidade visual nem a stack (shadcn/Tailwind). Registro em `docs/ETAPA-2.md`.

## Regras fiscais
- Nunca emitir NFS-e real; integração só em homologação e desligada até a Etapa 3.
- Não publicar a Edge Function sem autorização. Certificado/senhas/chaves só como secrets do backend.
- Não inventar códigos tributários (`cTribMun`), alíquotas ou regras fiscais.

## Git
- Trabalhar na branch de desenvolvimento; não fazer merge na `main` nem publicar em produção sem homologação.
- Textos da interface e documentação em português.
