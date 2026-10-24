# CLAUDE.md — Financeiro ASSOCIAPEC

Sistema de gestão financeira da ASSOCIAPEC (React + TypeScript + Supabase) com estrutura para NFS-e de
Campo Grande/MS. Leia `docs/ARQUITETURA.md` e `docs/ETAPA-1.md` antes de mudanças relevantes.

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
- Migração `fundacao` já aplicada. Mudanças de banco = **nova** migração em `supabase/migrations`,
  testada localmente e aplicada somente com autorização explícita.
- O projeto não concede privilégios automáticos: toda tabela nova precisa de `grant` explícito
  (nunca para `anon`), RLS e políticas usando `(select private.has_role(...))`. Funções internas
  vão no schema `private`. O stub de teste reproduz isso — não adicione grants nele.
- Links de e-mail do Auth são tratados em `app/src/auth/authRedirect.ts` (antes do HashRouter); mantenha
  `detectSessionInUrl: false`. Site URL de desenvolvimento: `http://localhost:5173` (porta fixa no Vite).
- Não criar/promover usuários, não importar dados pessoais reais e não escrever no banco sem autorização.

## Regras fiscais
- Nunca emitir NFS-e real; integração só em homologação e desligada até a Etapa 3.
- Não publicar a Edge Function sem autorização. Certificado/senhas/chaves só como secrets do backend.
- Não inventar códigos tributários (`cTribMun`), alíquotas ou regras fiscais.

## Git
- Trabalhar na branch de desenvolvimento; não fazer merge na `main` nem publicar em produção sem homologação.
- Textos da interface e documentação em português.
