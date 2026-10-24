-- =============================================================================
-- ASSOCIAPEC · Gestão Financeira — Etapa 1 (fundação)
-- Perfis, cadastros, contas a receber/pagar, anexos, auditoria e estrutura NFS-e.
--
-- ATENÇÃO: esta migração NÃO foi aplicada em nenhum Supabase remoto.
-- Aplicar somente após autorização (ver docs/ARQUITETURA.md, seção "Implantação").
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Perfis de acesso
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'financeiro', 'fiscal', 'consulta');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        public.app_role not null default 'consulta',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Papel do usuário logado (null se inativo ou sem perfil). SECURITY DEFINER para
-- poder ser usado dentro das políticas de RLS sem recursão em profiles.
create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

-- Todo novo usuário do Supabase Auth recebe perfil "consulta" (somente leitura).
-- A promoção de papel é feita por um administrador.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Utilitários: updated_at e auditoria
-- -----------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  actor       uuid,
  at          timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_at_idx on public.audit_log (at desc);

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, actor)
  values (
    tg_table_name,
    rec ->> 'id',
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Cadastros
-- -----------------------------------------------------------------------------
create table public.parties (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null check (kind in ('cliente', 'fornecedor', 'ambos')),
  person_type             text not null check (person_type in ('PF', 'PJ')),
  name                    text not null check (length(trim(name)) > 1),
  trade_name              text,
  document                text check (document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  state_registration      text,
  municipal_registration  text,
  email                   text,
  phone                   text,
  contact_name            text,
  cep                     text,
  street                  text,
  number                  text,
  complement              text,
  district                text,
  city                    text,
  uf                      char(2),
  city_ibge_code          text check (city_ibge_code ~ '^[0-9]{7}$'),
  notes                   text,
  active                  boolean not null default true,
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint parties_document_type check (
    document is null
    or (person_type = 'PF' and length(document) = 11)
    or (person_type = 'PJ' and length(document) = 14)
  )
);
-- evita cadastros duplicados pelo CPF/CNPJ
create unique index parties_document_uniq on public.parties (document) where document is not null;
create index parties_name_idx on public.parties (lower(name));

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('receita', 'despesa')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (type, name)
);

-- Serviços prestados. Os campos tributários ficam NULOS até a contabilidade
-- validar o código da tabela oficial (cTribMun é obrigatório para emitir NFS-e).
create table public.services (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  default_amount      numeric(14, 2) check (default_amount is null or default_amount >= 0),
  category_id         uuid references public.categories (id),
  c_trib_mun          text,
  c_trib_nac          text,
  nbs                 text,
  iss_rate            numeric(5, 2) check (iss_rate is null or (iss_rate >= 0 and iss_rate <= 100)),
  tax_validated       boolean not null default false,
  tax_validated_by    text,
  tax_validated_at    timestamptz,
  tax_notes           text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint services_validation_requires_code check (not tax_validated or c_trib_mun is not null)
);

-- Campos tributários só podem ser alterados por fiscal/admin; mudar o código
-- exige nova validação da contabilidade.
create function public.guard_service_tax() returns trigger
language plpgsql as $$
declare
  tax_changed boolean := tg_op = 'INSERT'
    or new.c_trib_mun is distinct from old.c_trib_mun or new.c_trib_nac is distinct from old.c_trib_nac
    or new.nbs is distinct from old.nbs or new.iss_rate is distinct from old.iss_rate
    or new.tax_validated is distinct from old.tax_validated or new.tax_validated_by is distinct from old.tax_validated_by;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tax_changed and not public.has_role('admin', 'fiscal')
     and (tg_op = 'UPDATE' or new.c_trib_mun is not null or new.tax_validated or new.iss_rate is not null) then
    raise exception 'Somente os perfis Fiscal e Administrador alteram dados tributários';
  end if;
  if tg_op = 'UPDATE' and old.tax_validated and new.tax_validated
     and (new.c_trib_mun is distinct from old.c_trib_mun or new.iss_rate is distinct from old.iss_rate
          or new.c_trib_nac is distinct from old.c_trib_nac) then
    raise exception 'Alterar o código tributário exige nova validação (desmarque "validado")';
  end if;
  return new;
end $$;
create trigger services_guard_tax before insert or update on public.services
  for each row execute function public.guard_service_tax();

-- -----------------------------------------------------------------------------
-- Contas a receber
-- -----------------------------------------------------------------------------
create table public.receivables (
  id               uuid primary key default gen_random_uuid(),
  party_id         uuid not null references public.parties (id),
  category_id      uuid references public.categories (id),
  service_id       uuid references public.services (id),
  description      text not null,
  document_number  text,
  issue_date       date not null default current_date,
  due_date         date not null,
  amount           numeric(14, 2) not null check (amount > 0),
  paid_amount      numeric(14, 2) not null default 0,
  canceled_at      timestamptz,
  cancel_reason    text,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index receivables_due_idx on public.receivables (due_date);
create index receivables_party_idx on public.receivables (party_id);

create table public.receivable_payments (
  id             uuid primary key default gen_random_uuid(),
  receivable_id  uuid not null references public.receivables (id) on delete cascade,
  paid_at        date not null,
  amount         numeric(14, 2) not null check (amount > 0),
  method         text not null,
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index receivable_payments_rec_idx on public.receivable_payments (receivable_id);

-- -----------------------------------------------------------------------------
-- Contas a pagar
-- -----------------------------------------------------------------------------
create table public.payables (
  id                    uuid primary key default gen_random_uuid(),
  party_id              uuid references public.parties (id),
  category_id           uuid references public.categories (id),
  description           text not null,
  document_number       text,
  due_date              date not null,
  amount                numeric(14, 2) not null check (amount > 0),
  paid_amount           numeric(14, 2) not null default 0,
  recurrence            text not null default 'nenhuma'
                        check (recurrence in ('nenhuma', 'mensal', 'trimestral', 'anual')),
  recurrence_parent_id  uuid references public.payables (id),
  canceled_at           timestamptz,
  cancel_reason         text,
  notes                 text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index payables_due_idx on public.payables (due_date);
-- impede gerar a mesma ocorrência recorrente duas vezes
create unique index payables_recurrence_uniq on public.payables (recurrence_parent_id, due_date)
  where recurrence_parent_id is not null;

create table public.payable_payments (
  id          uuid primary key default gen_random_uuid(),
  payable_id  uuid not null references public.payables (id) on delete cascade,
  paid_at     date not null,
  amount      numeric(14, 2) not null check (amount > 0),
  method      text not null,
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index payable_payments_pay_idx on public.payable_payments (payable_id);

-- Mantém paid_amount sincronizado e impede pagar acima do valor ou pagar conta cancelada.
create function public.sync_paid_amount() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent_table text := tg_argv[0];
  fk text := tg_argv[1];
  pay_table text := tg_table_name;
  parent_id uuid;
  total numeric;
  parent_amount numeric;
  parent_canceled timestamptz;
begin
  parent_id := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> fk)::uuid;
  execute format('select coalesce(sum(amount), 0) from public.%I where %I = $1', pay_table, fk)
    into total using parent_id;
  execute format('select amount, canceled_at from public.%I where id = $1', parent_table)
    into parent_amount, parent_canceled using parent_id;
  if tg_op <> 'DELETE' and parent_canceled is not null then
    raise exception 'Não é possível registrar pagamento em conta cancelada';
  end if;
  if total > parent_amount then
    raise exception 'Pagamentos (%) excedem o valor da conta (%)', total, parent_amount;
  end if;
  execute format('update public.%I set paid_amount = $1 where id = $2', parent_table)
    using total, parent_id;
  return null;
end $$;

create trigger receivable_payments_sync after insert or update or delete on public.receivable_payments
  for each row execute function public.sync_paid_amount('receivables', 'receivable_id');
create trigger payable_payments_sync after insert or update or delete on public.payable_payments
  for each row execute function public.sync_paid_amount('payables', 'payable_id');

-- paid_amount só muda via pagamentos (o frontend não consegue forjar o valor pago)
create function public.protect_paid_amount() returns trigger
language plpgsql as $$
begin
  if new.paid_amount is distinct from old.paid_amount and pg_trigger_depth() < 2 then
    raise exception 'paid_amount é calculado a partir dos pagamentos';
  end if;
  if new.amount < new.paid_amount then
    raise exception 'O valor da conta não pode ser menor que o total já pago';
  end if;
  return new;
end $$;
create trigger receivables_protect_paid before update on public.receivables
  for each row execute function public.protect_paid_amount();
create trigger payables_protect_paid before update on public.payables
  for each row execute function public.protect_paid_amount();

create function public.reset_paid_amount_on_insert() returns trigger
language plpgsql as $$
begin
  new.paid_amount := 0;
  return new;
end $$;
create trigger receivables_paid_insert before insert on public.receivables
  for each row execute function public.reset_paid_amount_on_insert();
create trigger payables_paid_insert before insert on public.payables
  for each row execute function public.reset_paid_amount_on_insert();

-- -----------------------------------------------------------------------------
-- Anexos (comprovantes) — metadados; o arquivo fica no bucket privado
-- -----------------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  entity        text not null check (entity in ('payable', 'receivable')),
  entity_id     uuid not null,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes <= 10485760),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity, entity_id);

-- -----------------------------------------------------------------------------
-- Módulo fiscal (NFS-e Campo Grande/MS) — estrutura; integração na Etapa 3
-- -----------------------------------------------------------------------------
create type public.fiscal_env as enum ('homologacao', 'producao');

-- Dados do prestador (ASSOCIAPEC). Uma linha por ambiente.
-- Certificado digital: aqui ficam APENAS metadados. O arquivo e a senha ficam
-- como secrets da Edge Function, nunca no banco acessível ao frontend.
create table public.fiscal_issuer (
  environment              public.fiscal_env primary key,
  cnpj                     text check (cnpj ~ '^[0-9]{14}$'),
  legal_name               text,
  trade_name               text,
  municipal_registration   text,
  city_ibge_code           text check (city_ibge_code ~ '^[0-9]{7}$'),
  tax_regime               text,
  simples_nacional         boolean,
  email                    text,
  phone                    text,
  address                  text,
  certificate_type         text not null default 'a_confirmar'
                           check (certificate_type in ('a_confirmar', 'A1', 'A3')),
  certificate_valid_until  date,
  certificate_notes        text,
  dps_series               text,
  next_dps_number          bigint not null default 1 check (next_dps_number > 0),
  updated_at               timestamptz not null default now()
);
insert into public.fiscal_issuer (environment) values ('homologacao'), ('producao');

create table public.nfse_documents (
  id               uuid primary key default gen_random_uuid(),
  environment      public.fiscal_env not null default 'homologacao',
  receivable_id    uuid references public.receivables (id),
  party_id         uuid not null references public.parties (id),
  service_id       uuid not null references public.services (id),
  status           text not null default 'rascunho'
                   check (status in ('rascunho', 'validada', 'enviada', 'autorizada', 'rejeitada', 'cancelada')),
  competence_date  date not null,
  amount           numeric(14, 2) not null check (amount > 0),
  description      text not null,
  c_trib_mun       text not null,
  dps_series       text,
  dps_number       bigint,
  dps_id           text,
  chave_acesso     text unique,
  xml_dps_path     text,
  xml_nfse_path    text,
  last_error       text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (environment, dps_series, dps_number)
);
create index nfse_documents_receivable_idx on public.nfse_documents (receivable_id);

-- Somente o backend (service_role) pode avançar além de rascunho/validada,
-- preencher chave de acesso, caminhos de XML ou criar registros de produção.
create function public.guard_nfse_document() returns trigger
language plpgsql as $$
begin
  -- backend (service_role) e conexões administrativas (SQL Editor/migrações) não são restringidos
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.environment <> 'homologacao' then
    raise exception 'Registros de produção só podem ser criados pelo backend fiscal';
  end if;
  if new.status not in ('rascunho', 'validada') then
    raise exception 'Status % só pode ser definido pelo backend fiscal', new.status;
  end if;
  if tg_op = 'UPDATE' and old.status not in ('rascunho', 'validada') then
    raise exception 'Documento já enviado não pode ser alterado pelo usuário';
  end if;
  if new.chave_acesso is not null or new.xml_dps_path is not null or new.xml_nfse_path is not null
     or new.dps_id is not null then
    raise exception 'Campos de retorno fiscal são preenchidos apenas pelo backend';
  end if;
  return new;
end $$;
create trigger nfse_documents_guard before insert or update on public.nfse_documents
  for each row execute function public.guard_nfse_document();

-- Histórico de solicitações/respostas/erros com a API municipal (escrita só pelo backend)
create table public.nfse_requests (
  id                bigint generated always as identity primary key,
  nfse_document_id  uuid references public.nfse_documents (id),
  environment       public.fiscal_env not null,
  operation         text not null check (operation in ('emitir', 'consultar_nfse', 'consultar_dps', 'evento')),
  http_method       text not null,
  url               text not null,
  http_status       integer,
  request_excerpt   text,
  response_body     text,
  error             text,
  duration_ms       integer,
  requested_by      uuid,
  created_at        timestamptz not null default now()
);
create index nfse_requests_doc_idx on public.nfse_requests (nfse_document_id);

create table public.nfse_events (
  id                bigint generated always as identity primary key,
  nfse_document_id  uuid not null references public.nfse_documents (id),
  environment       public.fiscal_env not null,
  event_type        text not null,
  description       text,
  protocol          text,
  status            text,
  xml_path          text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Triggers de updated_at e auditoria
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'parties', 'categories', 'services', 'receivables', 'payables',
                           'fiscal_issuer', 'nfse_documents'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                   t || '_touch', t);
  end loop;
  foreach t in array array['profiles', 'parties', 'categories', 'services', 'receivables', 'receivable_payments',
                           'payables', 'payable_payments', 'attachments', 'fiscal_issuer', 'nfse_documents',
                           'nfse_events'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

-- Impede que um usuário altere o próprio papel/ativação (só admin altera outros perfis)
create function public.guard_profile() returns trigger
language plpgsql as $$
begin
  -- backend (service_role) e conexões administrativas (SQL Editor/migrações) não são restringidos
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.has_role('admin') then
    raise exception 'Somente administradores alteram papel ou situação de usuários';
  end if;
  if new.id = auth.uid() and new.role is distinct from old.role then
    raise exception 'Um administrador não pode alterar o próprio papel';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.audit_log           enable row level security;
alter table public.parties             enable row level security;
alter table public.categories          enable row level security;
alter table public.services            enable row level security;
alter table public.receivables         enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.payables            enable row level security;
alter table public.payable_payments    enable row level security;
alter table public.attachments         enable row level security;
alter table public.fiscal_issuer       enable row level security;
alter table public.nfse_documents      enable row level security;
alter table public.nfse_requests       enable row level security;
alter table public.nfse_events         enable row level security;

-- profiles: cada um vê o próprio; admin vê e edita todos
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('admin'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role('admin'))
  with check (id = auth.uid() or public.has_role('admin'));

-- auditoria: somente admin lê; ninguém escreve diretamente (só o trigger)
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_role('admin'));

-- cadastros: leitura para qualquer perfil ativo
create policy parties_select on public.parties for select to authenticated
  using (public.current_app_role() is not null);
create policy parties_write on public.parties for insert to authenticated
  with check (public.has_role('admin', 'financeiro'));
create policy parties_update on public.parties for update to authenticated
  using (public.has_role('admin', 'financeiro')) with check (public.has_role('admin', 'financeiro'));
create policy parties_delete on public.parties for delete to authenticated
  using (public.has_role('admin'));

create policy categories_select on public.categories for select to authenticated
  using (public.current_app_role() is not null);
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_role('admin', 'financeiro'));
create policy categories_update on public.categories for update to authenticated
  using (public.has_role('admin', 'financeiro')) with check (public.has_role('admin', 'financeiro'));
create policy categories_delete on public.categories for delete to authenticated
  using (public.has_role('admin'));

create policy services_select on public.services for select to authenticated
  using (public.current_app_role() is not null);
create policy services_insert on public.services for insert to authenticated
  with check (public.has_role('admin', 'financeiro', 'fiscal'));
create policy services_update on public.services for update to authenticated
  using (public.has_role('admin', 'financeiro', 'fiscal')) with check (public.has_role('admin', 'financeiro', 'fiscal'));
create policy services_delete on public.services for delete to authenticated
  using (public.has_role('admin'));

-- financeiro: leitura para perfis ativos; escrita admin/financeiro; exclusão só admin
do $$
declare t text;
begin
  foreach t in array array['receivables', 'receivable_payments', 'payables', 'payable_payments', 'attachments'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.current_app_role() is not null)', t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (public.has_role('admin', 'financeiro'))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (public.has_role('admin', 'financeiro')) with check (public.has_role('admin', 'financeiro'))$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (public.has_role('admin'))$p$, t || '_delete', t);
  end loop;
end $$;

-- fiscal: dados do emitente visíveis a admin/fiscal/financeiro; edição admin/fiscal
create policy fiscal_issuer_select on public.fiscal_issuer for select to authenticated
  using (public.has_role('admin', 'fiscal', 'financeiro'));
create policy fiscal_issuer_update on public.fiscal_issuer for update to authenticated
  using (public.has_role('admin', 'fiscal')) with check (public.has_role('admin', 'fiscal'));

create policy nfse_documents_select on public.nfse_documents for select to authenticated
  using (public.current_app_role() is not null);
create policy nfse_documents_insert on public.nfse_documents for insert to authenticated
  with check (public.has_role('admin', 'fiscal'));
create policy nfse_documents_update on public.nfse_documents for update to authenticated
  using (public.has_role('admin', 'fiscal')) with check (public.has_role('admin', 'fiscal'));
create policy nfse_documents_delete on public.nfse_documents for delete to authenticated
  using (public.has_role('admin', 'fiscal') and status = 'rascunho');

create policy nfse_requests_select on public.nfse_requests for select to authenticated
  using (public.has_role('admin', 'fiscal'));
create policy nfse_events_select on public.nfse_events for select to authenticated
  using (public.has_role('admin', 'fiscal'));

-- -----------------------------------------------------------------------------
-- Storage privado
--   comprovantes/<entidade>/<id>/<arquivo>  — anexos financeiros
--   fiscal-xml/<ambiente>/<documento>/...    — XMLs (escrita só pelo backend)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('comprovantes', 'comprovantes', false, 10485760),
       ('fiscal-xml', 'fiscal-xml', false, 5242880)
on conflict (id) do nothing;

create policy comprovantes_read on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.current_app_role() is not null);
create policy comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.has_role('admin', 'financeiro'));
create policy comprovantes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and public.has_role('admin'));

create policy fiscal_xml_read on storage.objects for select to authenticated
  using (bucket_id = 'fiscal-xml' and public.has_role('admin', 'fiscal'));
