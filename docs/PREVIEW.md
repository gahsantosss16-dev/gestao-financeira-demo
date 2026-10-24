# Ambiente de testes na nuvem (Cloudflare Pages — gratuito)

Ambiente de **testes**, conectado ao Supabase ASSOCIAPEC (`cpepbgyycnbbfvtbzkgk`). Não é produção:
cada push na branch de desenvolvimento gera um novo deploy de teste.

## Por que não pelo Claude
Artifacts do claude.ai rodam dentro do visualizador do Claude (iframe isolado), sem uma URL própria
que os links de e-mail do Supabase Auth possam abrir — convite e recuperação de senha não funcionariam.
A sessão de nuvem do Claude Code é temporária e não tem endereço público.

## Configuração (uma vez, só pelo navegador)

1. Crie uma conta gratuita em https://dash.cloudflare.com (plano Free).
2. *Workers & Pages → Create → Pages → Connect to Git* → autorize o GitHub **apenas** para o
   repositório `gahsantosss16-dev/gestao-financeira-demo`.
3. Configure o projeto:

   | Campo | Valor |
   | --- | --- |
   | Project name | `financeiro-associapec` |
   | Production branch | `main` (não haverá deploy nela até o merge autorizado) |
   | Framework preset | None |
   | Root directory | `app` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. *Environment variables* (Settings → Variables and Secrets; marque **Preview**, e Production se quiser):

   | Nome | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://cpepbgyycnbbfvtbzkgk.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | chave **publishable** (Supabase → Settings → API Keys) |

   Somente a chave pública. **Nunca** use a `service_role`/secret key aqui.

5. *Settings → Builds → Branch control*: em *Preview branches*, escolha **Custom** e inclua
   apenas `claude/adoring-allen-3sgfbd` (evita builds de outras branches).
6. Dispare um novo deploy da branch (Deployments → *Retry* ou um novo push).

## URL de testes
Cloudflare cria um endereço fixo por branch (nome em minúsculas, `/` vira `-`):

```
https://claude-adoring-allen-3sgfbd.financeiro-associapec.pages.dev
```

Se o nome `financeiro-associapec` já estiver em uso, a Cloudflare acrescenta um sufixo —
confira o endereço exato em *Deployments → Branch alias*.

## Supabase → Authentication → URL Configuration

| Campo | Valor |
| --- | --- |
| Site URL | `https://claude-adoring-allen-3sgfbd.financeiro-associapec.pages.dev` |
| Redirect URLs | `https://claude-adoring-allen-3sgfbd.financeiro-associapec.pages.dev/**` (mantenha as de `localhost` se for usar localmente) |

Mantenha **desativado** *Allow new users to sign up* (Authentication → Sign In / Providers).

## Testes
1. Abra a URL de testes → tela **Entrar** (sem a faixa "DEMONSTRAÇÃO" = conectado ao Supabase).
2. **Esqueci minha senha** → informe o e-mail do usuário convidado → abra o link do e-mail **uma vez**
   → tela **Defina sua senha** → salve → painel financeiro (perfil Consulta).
3. **Sair** e entrar novamente com e-mail e a nova senha.

Observações: o endereço é público, mas o app exige login, o cadastro público fica desativado e os dados
são protegidos por RLS. A página tem `noindex`. Para restringir até o acesso à tela de login, é possível
ativar *Cloudflare Access* (gratuito até 50 usuários) no projeto — opcional.
