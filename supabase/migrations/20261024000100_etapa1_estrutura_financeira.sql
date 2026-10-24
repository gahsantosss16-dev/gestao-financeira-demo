-- ============================================================================
-- ASSOCIAPEC Financeiro — Etapa 1: estrutura financeira inicial.
--
-- NÃO APLICADA em nenhum Supabase remoto. Aplicação somente com autorização
-- explícita (ver CLAUDE.md). Validada localmente por
-- supabase/tests/etapa1.test.ts (PostgreSQL real via PGlite, dados sintéticos).
--
-- Padrões reaproveitados:
--   * Neuro Hub Pro (202609010001_financial_module_schema.sql): função
--     security definer de acesso financeiro + policy RESTRICTIVE, trigger de
--     updated_at, advisory lock contra corrida, mensagens por código de erro.
--   * Neuro Hub Pro (202609110003_patient_trash_audit_trail.sql): trilha de
--     auditoria imutável (trigger que rejeita UPDATE/DELETE).
--   * LSB (20260902010000_p0_backend_authorization_and_atomic_os.sql):
--     operações críticas só por RPC atômica; colunas protegidas fora do
--     alcance de UPDATE direto do cliente.
--
-- Decisões próprias da ASSOCIAPEC:
--   * valores monetários em centavos (bigint), nunca float;
--   * nada é apagado: lançamento é cancelado, baixa é estornada;
--   * chave de idempotência em lançamentos, baixas e emissões NFS-e;
--   * NFS-e com ambientes separados e produção desabilitada por padrão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfis e permissões
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.papel_usuario as enum ('admin', 'financeiro', 'consulta');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text,
  -- Menor privilégio: toda conta nova nasce somente leitura e inativa até
  -- um administrador liberar.
  papel public.papel_usuario not null default 'consulta',
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_papel()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.profiles where id = auth.uid() and ativo is true limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_papel() = 'admin', false);
$$;

-- Leitura financeira: qualquer perfil ativo.
create or replace function public.can_read_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_papel() is not null;
$$;

-- Escrita financeira: admin e financeiro.
create or replace function public.can_write_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_papel() in ('admin', 'financeiro'), false);
$$;

revoke all on function public.current_papel(), public.is_admin(), public.can_read_finance(),
  public.can_write_finance() from public, anon;
grant execute on function public.current_papel(), public.is_admin(), public.can_read_finance(),
  public.can_write_finance() to authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nome, papel, ativo) on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Um administrador não pode rebaixar nem desativar a si mesmo (evita ficar
-- sem nenhum administrador por engano).
create or replace function public.protect_own_admin_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.id = auth.uid() and (new.papel <> old.papel or new.ativo <> old.ativo) then
    raise exception 'Você não pode alterar o próprio perfil de acesso.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_own_admin on public.profiles;
create trigger profiles_protect_own_admin
before update on public.profiles
for each row execute function public.protect_own_admin_profile();

-- ---------------------------------------------------------------------------
-- Validação de CPF/CNPJ no servidor (mesmo algoritmo de src/lib/documento.ts)
-- ---------------------------------------------------------------------------

create or replace function public.documento_valido(p_documento text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  pesos1 int[];
  pesos2 int[];
  soma int;
  resto int;
  dv1 int;
  dv2 int;
  i int;
begin
  if length(d) not in (11, 14) or d ~ '^(\d)\1+$' then
    return false;
  end if;
  if length(d) = 11 then
    pesos1 := array[10, 9, 8, 7, 6, 5, 4, 3, 2];
    pesos2 := array[11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  else
    pesos1 := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    pesos2 := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  end if;
  soma := 0;
  for i in 1 .. array_length(pesos1, 1) loop
    soma := soma + substr(d, i, 1)::int * pesos1[i];
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;
  soma := 0;
  for i in 1 .. array_length(pesos2, 1) loop
    soma := soma + substr(d, i, 1)::int * pesos2[i];
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;
  return right(d, 2) = dv1::text || dv2::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastro unificado de pessoas (associados, clientes, fornecedores)
-- ---------------------------------------------------------------------------

create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null check (tipo_pessoa in ('PF', 'PJ')),
  documento text check (documento is null or (documento ~ '^\d+$' and public.documento_valido(documento))),
  nome text not null check (length(btrim(nome)) > 0),
  nome_fantasia text,
  email text,
  telefone text check (telefone is null or telefone ~ '^\d{10,11}$'),
  cep text check (cep is null or cep ~ '^\d{8}$'),
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  -- Necessário para o tomador da NFS-e.
  codigo_municipio_ibge text check (codigo_municipio_ibge is null or codigo_municipio_ibge ~ '^\d{7}$'),
  inscricao_municipal text,
  papeis text[] not null default '{}'
    check (papeis <@ array['associado', 'cliente', 'fornecedor']::text[]),
  observacoes text,
  ativo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pessoas_documento_tipo check (
    documento is null
    or (tipo_pessoa = 'PF' and length(documento) = 11)
    or (tipo_pessoa = 'PJ' and length(documento) = 14)
  )
);

-- Duplicidade bloqueada no banco (o LSB tinha fallback que baixava a tabela
-- inteira no navegador para checar duplicidade; aqui a regra é do servidor).
create unique index if not exists pessoas_documento_unico
  on public.pessoas (documento) where documento is not null;
create index if not exists pessoas_nome_idx on public.pessoas (lower(nome));

drop trigger if exists pessoas_set_updated_at on public.pessoas;
create trigger pessoas_set_updated_at
before update on public.pessoas
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categorias e contas (caixa/banco)
-- ---------------------------------------------------------------------------

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  tipo text not null check (tipo in ('receita', 'despesa')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists categorias_nome_unico on public.categorias (tipo, lower(nome));

drop trigger if exists categorias_set_updated_at on public.categorias;
create trigger categorias_set_updated_at
before update on public.categorias
for each row execute function public.set_updated_at();

create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  tipo text not null check (tipo in ('caixa', 'banco', 'outro')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contas_nome_unico on public.contas (lower(nome));

drop trigger if exists contas_set_updated_at on public.contas;
create trigger contas_set_updated_at
before update on public.contas
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lançamentos (contas a pagar e a receber)
-- ---------------------------------------------------------------------------

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  pessoa_id uuid references public.pessoas(id) on delete restrict,
  categoria_id uuid references public.categorias(id) on delete restrict,
  descricao text not null check (length(btrim(descricao)) > 0),
  competencia date not null,
  vencimento date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  -- Mantidos exclusivamente pelos triggers/RPCs abaixo.
  valor_pago_centavos bigint not null default 0 check (valor_pago_centavos >= 0),
  status text not null default 'aberto' check (status in ('aberto', 'parcial', 'pago', 'cancelado')),
  parcela_numero int not null default 1 check (parcela_numero >= 1),
  parcela_total int not null default 1 check (parcela_total >= 1),
  grupo_parcelamento uuid,
  documento_ref text,
  observacoes text,
  -- Gerada pelo navegador uma vez por formulário: reenviar o mesmo formulário
  -- (duplo clique, falha de rede) não cria um segundo lançamento.
  chave_idempotencia uuid not null unique,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  versao int not null default 1,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancamentos_parcela_valida check (parcela_numero <= parcela_total),
  constraint lancamentos_pago_ate_valor check (valor_pago_centavos <= valor_centavos)
);
create index if not exists lancamentos_vencimento_idx on public.lancamentos (tipo, vencimento);
create index if not exists lancamentos_pessoa_idx on public.lancamentos (pessoa_id);

create or replace function public.lancamentos_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'cancelado' then
      raise exception 'Lançamento cancelado não pode ser alterado.' using errcode = '42501';
    end if;
    if new.valor_centavos <> old.valor_centavos and old.valor_pago_centavos > 0 then
      raise exception 'Não é possível alterar o valor de um lançamento com baixas. Estorne as baixas antes.'
        using errcode = '42501';
    end if;
    new.versao := old.versao + 1;
    new.updated_at := now();
  end if;
  if new.status <> 'cancelado' then
    new.status := case
      when new.valor_pago_centavos = 0 then 'aberto'
      when new.valor_pago_centavos < new.valor_centavos then 'parcial'
      else 'pago'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists lancamentos_before_write on public.lancamentos;
create trigger lancamentos_before_write
before insert or update on public.lancamentos
for each row execute function public.lancamentos_before_write();

-- ---------------------------------------------------------------------------
-- Baixas (pagamentos e recebimentos) — somente via RPC
-- ---------------------------------------------------------------------------

create table if not exists public.baixas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete restrict,
  data_pagamento date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  forma_pagamento text not null
    check (forma_pagamento in ('pix', 'boleto', 'transferencia', 'dinheiro', 'cartao', 'debito_automatico', 'outro')),
  conta_id uuid references public.contas(id) on delete restrict,
  chave_idempotencia uuid not null unique,
  estornada boolean not null default false,
  estornada_em timestamptz,
  estornada_por uuid references auth.users(id) on delete set null,
  motivo_estorno text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists baixas_lancamento_idx on public.baixas (lancamento_id);

create or replace function public.registrar_baixa(
  p_lancamento_id uuid,
  p_valor_centavos bigint,
  p_data_pagamento date,
  p_forma_pagamento text,
  p_conta_id uuid,
  p_chave_idempotencia uuid
)
returns public.baixas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lancamento public.lancamentos;
  v_baixa public.baixas;
begin
  if not public.can_write_finance() then
    raise exception 'Você não possui permissão para registrar baixas.' using errcode = '42501';
  end if;
  if p_chave_idempotencia is null then
    raise exception 'Chave de idempotência obrigatória.' using errcode = '22023';
  end if;

  -- Bloqueia o lançamento: duas baixas simultâneas são serializadas e a
  -- segunda enxerga o saldo já atualizado pela primeira.
  select * into v_lancamento from public.lancamentos where id = p_lancamento_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;

  -- Reenvio da mesma operação devolve a baixa já registrada.
  select * into v_baixa from public.baixas where chave_idempotencia = p_chave_idempotencia;
  if found then
    if v_baixa.lancamento_id <> p_lancamento_id then
      raise exception 'Chave de idempotência já usada em outro lançamento.' using errcode = '23505';
    end if;
    return v_baixa;
  end if;

  if v_lancamento.status = 'cancelado' then
    raise exception 'Lançamento cancelado não aceita baixa.' using errcode = '42501';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;
  if p_valor_centavos > v_lancamento.valor_centavos - v_lancamento.valor_pago_centavos then
    raise exception 'Valor maior que o saldo em aberto do lançamento.' using errcode = '22023';
  end if;

  insert into public.baixas (lancamento_id, data_pagamento, valor_centavos, forma_pagamento, conta_id,
    chave_idempotencia, created_by)
  values (p_lancamento_id, p_data_pagamento, p_valor_centavos, p_forma_pagamento, p_conta_id,
    p_chave_idempotencia, auth.uid())
  returning * into v_baixa;

  update public.lancamentos
  set valor_pago_centavos = valor_pago_centavos + p_valor_centavos
  where id = p_lancamento_id;

  return v_baixa;
end;
$$;

create or replace function public.estornar_baixa(p_baixa_id uuid, p_motivo text)
returns public.baixas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baixa public.baixas;
begin
  if not public.can_write_finance() then
    raise exception 'Você não possui permissão para estornar baixas.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo do estorno.' using errcode = '22023';
  end if;

  select * into v_baixa from public.baixas where id = p_baixa_id;
  if not found then
    raise exception 'Baixa não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.lancamentos where id = v_baixa.lancamento_id for update;
  select * into v_baixa from public.baixas where id = p_baixa_id;
  if v_baixa.estornada then
    raise exception 'Esta baixa já foi estornada.' using errcode = '22023';
  end if;

  update public.baixas
  set estornada = true, estornada_em = now(), estornada_por = auth.uid(), motivo_estorno = btrim(p_motivo)
  where id = p_baixa_id
  returning * into v_baixa;

  update public.lancamentos
  set valor_pago_centavos = valor_pago_centavos - v_baixa.valor_centavos
  where id = v_baixa.lancamento_id;

  return v_baixa;
end;
$$;

create or replace function public.cancelar_lancamento(p_lancamento_id uuid, p_motivo text)
returns public.lancamentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lancamento public.lancamentos;
begin
  if not public.can_write_finance() then
    raise exception 'Você não possui permissão para cancelar lançamentos.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;
  select * into v_lancamento from public.lancamentos where id = p_lancamento_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_lancamento.status = 'cancelado' then
    return v_lancamento;
  end if;
  if v_lancamento.valor_pago_centavos > 0 then
    raise exception 'Estorne as baixas antes de cancelar o lançamento.' using errcode = '42501';
  end if;

  update public.lancamentos
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
  where id = p_lancamento_id
  returning * into v_lancamento;
  return v_lancamento;
end;
$$;

revoke all on function public.registrar_baixa(uuid, bigint, date, text, uuid, uuid),
  public.estornar_baixa(uuid, text), public.cancelar_lancamento(uuid, text) from public, anon;
grant execute on function public.registrar_baixa(uuid, bigint, date, text, uuid, uuid),
  public.estornar_baixa(uuid, text), public.cancelar_lancamento(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS e privilégios das tabelas financeiras
-- ---------------------------------------------------------------------------

alter table public.pessoas enable row level security;
alter table public.categorias enable row level security;
alter table public.contas enable row level security;
alter table public.lancamentos enable row level security;
alter table public.baixas enable row level security;

revoke all on public.pessoas, public.categorias, public.contas, public.lancamentos, public.baixas
  from anon, authenticated;

-- Nada é apagado pelo cliente: sem DELETE em nenhuma tabela financeira.
grant select, insert, update on public.pessoas, public.categorias, public.contas to authenticated;
grant select on public.lancamentos, public.baixas to authenticated;
grant insert (tipo, pessoa_id, categoria_id, descricao, competencia, vencimento, valor_centavos,
  parcela_numero, parcela_total, grupo_parcelamento, documento_ref, observacoes, chave_idempotencia)
  on public.lancamentos to authenticated;
-- Status, valor pago e cancelamento ficam fora do UPDATE direto.
grant update (pessoa_id, categoria_id, descricao, competencia, vencimento, valor_centavos,
  documento_ref, observacoes)
  on public.lancamentos to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['pessoas', 'categorias', 'contas', 'lancamentos', 'baixas'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.can_read_finance())', t);
    if t <> 'baixas' then
      execute format('drop policy if exists %1$s_insert on public.%1$s', t);
      execute format(
        'create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write_finance())', t);
      execute format('drop policy if exists %1$s_update on public.%1$s', t);
      execute format(
        'create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write_finance()) with check (public.can_write_finance())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Trilha de auditoria imutável
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  ator_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_registro_idx on public.audit_log (tabela, registro_id, occurred_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (public.is_admin());

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Eventos de auditoria são imutáveis.' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
before update or delete on public.audit_log
for each row execute function public.prevent_audit_mutation();

-- registro_id: "id" da linha (ou "ambiente" em nfse_configuracao).
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (tabela, registro_id, acao, ator_id, dados_antes, dados_depois)
  values (
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'ambiente'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- NFS-e (Campo Grande/MS) — estrutura preparada, sem emissão nesta etapa
-- ---------------------------------------------------------------------------

-- Configuração fiscal por ambiente. Códigos tributários ficam vazios até
-- serem informados e validados pela contabilidade (nada é presumido).
-- Certificado digital e senha NUNCA ficam aqui: pertencem ao cofre de
-- segredos da função de servidor responsável pela assinatura.
create table if not exists public.nfse_configuracao (
  ambiente text primary key check (ambiente in ('homologacao', 'producao')),
  cnpj_prestador text check (cnpj_prestador is null or public.documento_valido(cnpj_prestador)),
  inscricao_municipal text,
  codigo_municipio_ibge text check (codigo_municipio_ibge is null or codigo_municipio_ibge ~ '^\d{7}$'),
  regime_tributario text,
  codigo_tributacao_nacional text,
  codigo_tributacao_municipal text,
  aliquota_iss_basis_points int check (aliquota_iss_basis_points is null or aliquota_iss_basis_points between 0 and 10000),
  serie_dps text,
  url_api text,
  validada boolean not null default false,
  validada_por uuid references auth.users(id) on delete set null,
  validada_em timestamptz,
  producao_habilitada boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint nfse_producao_somente_no_ambiente_producao
    check (producao_habilitada = false or ambiente = 'producao'),
  constraint nfse_producao_exige_validacao
    check (producao_habilitada = false or validada = true)
);

drop trigger if exists nfse_configuracao_set_updated_at on public.nfse_configuracao;
create trigger nfse_configuracao_set_updated_at
before update on public.nfse_configuracao
for each row execute function public.set_updated_at();

create table if not exists public.nfse_emissoes (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete restrict,
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'validada', 'enviando', 'autorizada', 'rejeitada', 'cancelada', 'erro_comunicacao')),
  chave_idempotencia uuid not null unique,
  serie_dps text,
  numero_dps bigint,
  dps_xml text,
  xml_retorno text,
  protocolo text,
  chave_acesso text,
  numero_nfse text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfse_emissoes_numero_unico unique (ambiente, serie_dps, numero_dps)
);
-- No máximo uma emissão "viva" por lançamento e ambiente: uma falha de
-- comunicação não pode resultar em segunda nota para o mesmo serviço.
create unique index if not exists nfse_emissoes_uma_ativa_por_lancamento
  on public.nfse_emissoes (lancamento_id, ambiente)
  where status not in ('rejeitada', 'cancelada');

drop trigger if exists nfse_emissoes_set_updated_at on public.nfse_emissoes;
create trigger nfse_emissoes_set_updated_at
before update on public.nfse_emissoes
for each row execute function public.set_updated_at();

create table if not exists public.nfse_eventos (
  id bigint generated always as identity primary key,
  emissao_id uuid not null references public.nfse_emissoes(id) on delete restrict,
  tipo text not null,
  codigo text,
  mensagem text,
  payload text,
  occurred_at timestamptz not null default now()
);

drop trigger if exists nfse_eventos_immutable on public.nfse_eventos;
create trigger nfse_eventos_immutable
before update or delete on public.nfse_eventos
for each row execute function public.prevent_audit_mutation();

alter table public.nfse_configuracao enable row level security;
alter table public.nfse_emissoes enable row level security;
alter table public.nfse_eventos enable row level security;
revoke all on public.nfse_configuracao, public.nfse_emissoes, public.nfse_eventos from anon, authenticated;

-- Configuração: leitura para quem acessa o financeiro; edição só admin, e a
-- habilitação de produção fica fora do alcance do cliente (somente pelo
-- painel do Supabase/service role, com autorização registrada).
grant select on public.nfse_configuracao, public.nfse_emissoes, public.nfse_eventos to authenticated;
grant insert (ambiente, cnpj_prestador, inscricao_municipal, codigo_municipio_ibge, regime_tributario,
  codigo_tributacao_nacional, codigo_tributacao_municipal, aliquota_iss_basis_points, serie_dps, url_api)
  on public.nfse_configuracao to authenticated;
grant update (cnpj_prestador, inscricao_municipal, codigo_municipio_ibge, regime_tributario,
  codigo_tributacao_nacional, codigo_tributacao_municipal, aliquota_iss_basis_points, serie_dps, url_api)
  on public.nfse_configuracao to authenticated;

-- Qualquer alteração de dado fiscal invalida a validação anterior.
create or replace function public.nfse_configuracao_invalida_validacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.cnpj_prestador, new.inscricao_municipal, new.codigo_municipio_ibge, new.regime_tributario,
      new.codigo_tributacao_nacional, new.codigo_tributacao_municipal, new.aliquota_iss_basis_points,
      new.serie_dps, new.url_api)
     is distinct from
     (old.cnpj_prestador, old.inscricao_municipal, old.codigo_municipio_ibge, old.regime_tributario,
      old.codigo_tributacao_nacional, old.codigo_tributacao_municipal, old.aliquota_iss_basis_points,
      old.serie_dps, old.url_api)
     and new.validada = old.validada then
    new.validada := false;
    new.validada_por := null;
    new.validada_em := null;
    new.producao_habilitada := false;
  end if;
  return new;
end;
$$;

drop trigger if exists nfse_configuracao_invalida on public.nfse_configuracao;
create trigger nfse_configuracao_invalida
before update on public.nfse_configuracao
for each row execute function public.nfse_configuracao_invalida_validacao();

drop policy if exists nfse_configuracao_select on public.nfse_configuracao;
create policy nfse_configuracao_select on public.nfse_configuracao
  for select to authenticated using (public.can_read_finance());
drop policy if exists nfse_configuracao_admin_insert on public.nfse_configuracao;
create policy nfse_configuracao_admin_insert on public.nfse_configuracao
  for insert to authenticated with check (public.is_admin());
drop policy if exists nfse_configuracao_admin_update on public.nfse_configuracao;
create policy nfse_configuracao_admin_update on public.nfse_configuracao
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Emissões e eventos: somente leitura no cliente. A escrita será feita pela
-- função de servidor de emissão (etapa futura, service role).
drop policy if exists nfse_emissoes_select on public.nfse_emissoes;
create policy nfse_emissoes_select on public.nfse_emissoes
  for select to authenticated using (public.can_read_finance());
drop policy if exists nfse_eventos_select on public.nfse_eventos;
create policy nfse_eventos_select on public.nfse_eventos
  for select to authenticated using (public.can_read_finance());

-- ---------------------------------------------------------------------------
-- Auditoria ligada nas tabelas sensíveis
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'pessoas', 'categorias', 'contas', 'lancamentos', 'baixas',
    'nfse_configuracao', 'nfse_emissoes'] loop
    execute format('drop trigger if exists %1$s_audit on public.%1$s', t);
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Relatório: resumo mensal (respeita a RLS de quem consulta)
-- ---------------------------------------------------------------------------

create or replace view public.vw_resumo_mensal
with (security_invoker = true)
as
select
  date_trunc('month', vencimento)::date as mes,
  tipo,
  count(*) as quantidade,
  sum(valor_centavos) as previsto_centavos,
  sum(valor_pago_centavos) as realizado_centavos,
  sum(valor_centavos - valor_pago_centavos) as em_aberto_centavos
from public.lancamentos
where status <> 'cancelado'
group by 1, 2;

revoke all on public.vw_resumo_mensal from anon, authenticated;
grant select on public.vw_resumo_mensal to authenticated;
