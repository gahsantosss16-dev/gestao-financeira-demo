-- =============================================================================
-- ASSOCIAPEC · Gestão Financeira — Etapa 2 (operação financeira)
--   1. Inscrições estaduais (várias por produtor; UF + IE únicos)
--   2. Pagamentos: estorno com justificativa (sem apagar), idempotência e
--      trava de linha contra baixas concorrentes
--   3. Cobranças com código sequencial
--   4. Importação de planilhas (lotes, linhas e rastreio de origem)
--   5. Unicidade sem diferenciar maiúsculas em categorias e serviços
--
-- Segue o modelo de permissões do projeto: grants explícitos, nada para anon,
-- funções internas em `private`, RLS em todas as tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Inscrições estaduais
-- -----------------------------------------------------------------------------
alter table public.parties add column rural_producer boolean not null default false;
comment on column public.parties.state_registration is
  'Legado (Etapa 1). Inscrições estaduais ficam em party_registrations.';

create table public.party_registrations (
  id              uuid primary key default gen_random_uuid(),
  party_id        uuid not null references public.parties (id) on delete cascade,
  uf              char(2) not null check (uf ~ '^[A-Z]{2}$'),
  ie              text not null check (ie ~ '^[0-9]{2,14}$'),
  property_name   text,
  city            text,
  city_ibge_code  text check (city_ibge_code ~ '^[0-9]{7}$'),
  status          text,
  checked_at      timestamptz,
  is_primary      boolean not null default false,
  active          boolean not null default true,
  notes           text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a IE só é única dentro da UF; um mesmo CPF/CNPJ pode ter várias propriedades
  unique (uf, ie)
);
create index party_registrations_party_idx on public.party_registrations (party_id);
create unique index party_registrations_primary_uniq on public.party_registrations (party_id) where is_primary;

-- aproveita IEs já digitadas no campo legado (quando o formato permitir)
insert into public.party_registrations (party_id, uf, ie, is_primary)
select id, upper(coalesce(uf, 'MS')), regexp_replace(state_registration, '\D', '', 'g'), true
from public.parties
where regexp_replace(coalesce(state_registration, ''), '\D', '', 'g') ~ '^[0-9]{2,14}$'
on conflict (uf, ie) do nothing;

alter table public.receivables add column registration_id uuid references public.party_registrations (id) on delete set null;
create index receivables_registration_idx on public.receivables (registration_id);

-- -----------------------------------------------------------------------------
-- 2. Pagamentos: estorno sem apagar, idempotência e concorrência
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['receivable_payments', 'payable_payments'] loop
    execute format('alter table public.%I
      add column reversed_at timestamptz,
      add column reversed_by uuid,
      add column reversal_reason text,
      add column client_request_id uuid unique,
      add constraint %I check ((reversed_at is null) = (reversal_reason is null)),
      add constraint %I check (reversal_reason is null or length(trim(reversal_reason)) >= 5)',
      t, t || '_reversal_pair', t || '_reversal_reason_len');
  end loop;
end $$;

-- Recalcula o valor pago ignorando estornos. A conta é travada (FOR UPDATE)
-- antes da soma: duas baixas simultâneas na mesma conta são serializadas e a
-- segunda já enxerga a primeira, impedindo pagar acima do saldo.
create or replace function private.sync_paid_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  execute format('select amount, canceled_at from public.%I where id = $1 for update', parent_table)
    into parent_amount, parent_canceled using parent_id;
  if tg_op = 'INSERT' and parent_canceled is not null then
    raise exception 'Não é possível registrar pagamento em conta cancelada';
  end if;
  execute format('select coalesce(sum(amount), 0) from public.%I where %I = $1 and reversed_at is null', pay_table, fk)
    into total using parent_id;
  if total > parent_amount then
    raise exception 'Pagamentos (%) excedem o valor da conta (%)', total, parent_amount;
  end if;
  execute format('update public.%I set paid_amount = $1 where id = $2', parent_table)
    using total, parent_id;
  return null;
end $$;

-- Pagamento é imutável; a única alteração permitida é o estorno (uma vez, com motivo).
create function private.guard_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.reversed_at is not null or new.reversal_reason is not null then
      raise exception 'Um pagamento não pode ser registrado já estornado';
    end if;
    return new;
  end if;
  if old.reversed_at is not null then
    raise exception 'Este pagamento já foi estornado';
  end if;
  if (to_jsonb(new) - array['reversed_at', 'reversed_by', 'reversal_reason'])
     is distinct from (to_jsonb(old) - array['reversed_at', 'reversed_by', 'reversal_reason']) then
    raise exception 'Pagamentos não podem ser alterados; registre um estorno e lance novamente';
  end if;
  if new.reversal_reason is null or length(trim(new.reversal_reason)) < 5 then
    raise exception 'Informe a justificativa do estorno (mínimo de 5 caracteres)';
  end if;
  new.reversed_at := now();
  new.reversed_by := auth.uid();
  return new;
end $$;
create trigger receivable_payments_guard before insert or update on public.receivable_payments
  for each row execute function private.guard_payment();
create trigger payable_payments_guard before insert or update on public.payable_payments
  for each row execute function private.guard_payment();

-- Conta com pagamentos (mesmo estornados) não pode ser excluída: cancele.
create function private.block_delete_with_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
declare has_payments boolean;
begin
  execute format('select exists (select 1 from public.%I where %I = $1)', tg_argv[0], tg_argv[1])
    into has_payments using old.id;
  if has_payments then
    raise exception 'Conta com pagamentos registrados não pode ser excluída; utilize o cancelamento';
  end if;
  return old;
end $$;
create trigger receivables_block_delete before delete on public.receivables
  for each row execute function private.block_delete_with_payments('receivable_payments', 'receivable_id');
create trigger payables_block_delete before delete on public.payables
  for each row execute function private.block_delete_with_payments('payable_payments', 'payable_id');

-- histórico preservado: usuários não apagam pagamentos (estornam)
revoke delete on public.receivable_payments, public.payable_payments from authenticated;

-- e-mail do perfil acompanha o Auth; o próprio usuário só altera o nome
create or replace function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not private.has_role('admin') then
    raise exception 'Somente administradores alteram papel ou situação de usuários';
  end if;
  if new.id = auth.uid() and new.role is distinct from old.role then
    raise exception 'Um administrador não pode alterar o próprio papel';
  end if;
  if new.email is distinct from old.email then
    raise exception 'O e-mail é alterado somente pelo cadastro de acesso';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Cobranças
-- -----------------------------------------------------------------------------
create table public.charges (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  year                  integer not null,
  number                integer not null,
  receivable_id         uuid not null references public.receivables (id),
  party_id              uuid not null references public.parties (id),
  amount                numeric(14, 2) not null check (amount > 0),
  due_date              date not null,
  description           text not null,
  notes                 text,
  canceled_at           timestamptz,
  cancel_reason         text,
  last_notified_at      timestamptz,
  notification_channel  text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (year, number)
);
-- uma cobrança ativa por obrigação
create unique index charges_active_receivable_uniq on public.charges (receivable_id) where canceled_at is null;
create index charges_party_idx on public.charges (party_id);
create index charges_due_idx on public.charges (due_date);

-- Numeração anual COB-AAAA-NNNNN. Trava consultiva por ano (mesmo padrão dos
-- recibos do Neuro Hub Pro) + unique (year, number) como rede de segurança.
create function private.prepare_charge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rec record;
begin
  if tg_op = 'UPDATE' then
    if new.code is distinct from old.code or new.year is distinct from old.year
       or new.number is distinct from old.number or new.receivable_id is distinct from old.receivable_id then
      raise exception 'Código e conta de origem da cobrança não podem ser alterados';
    end if;
    if old.canceled_at is not null and new.canceled_at is null then
      raise exception 'Cobrança cancelada não pode ser reativada; gere uma nova';
    end if;
    return new;
  end if;
  select party_id, amount, due_date, description, canceled_at into rec
    from public.receivables where id = new.receivable_id;
  if not found then raise exception 'Conta a receber não encontrada'; end if;
  if rec.canceled_at is not null then raise exception 'Conta a receber cancelada não pode gerar cobrança'; end if;
  new.party_id := rec.party_id;
  new.amount := coalesce(new.amount, rec.amount);
  new.due_date := coalesce(new.due_date, rec.due_date);
  new.description := coalesce(nullif(trim(new.description), ''), rec.description);
  if new.amount > rec.amount then raise exception 'Valor da cobrança maior que o da conta a receber'; end if;
  new.year := extract(year from now())::int;
  perform pg_advisory_xact_lock(hashtext('associapec_charges'), new.year);
  select coalesce(max(number), 0) + 1 into new.number from public.charges where year = new.year;
  new.code := format('COB-%s-%s', new.year, lpad(new.number::text, 5, '0'));
  return new;
end $$;
create trigger charges_prepare before insert or update on public.charges
  for each row execute function private.prepare_charge();

-- -----------------------------------------------------------------------------
-- 4. Importação de planilhas
-- -----------------------------------------------------------------------------
create table public.import_batches (
  id                  uuid primary key default gen_random_uuid(),
  file_name           text not null,
  file_sha256         text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  source              text not null default 'planilha_estado',
  sheet_name          text,
  mapping             jsonb not null,
  options             jsonb not null default '{}',
  status              text not null default 'processando'
                      check (status in ('processando', 'concluida', 'concluida_com_erros', 'interrompida')),
  total_rows          integer not null default 0,
  created_count       integer not null default 0,
  updated_count       integer not null default 0,
  linked_count        integer not null default 0,
  skipped_count       integer not null default 0,
  error_count         integer not null default 0,
  receivables_created integer not null default 0,
  charges_created     integer not null default 0,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index import_batches_created_idx on public.import_batches (created_at desc);
create index import_batches_hash_idx on public.import_batches (file_sha256);

create table public.import_rows (
  id               bigint generated always as identity primary key,
  batch_id         uuid not null references public.import_batches (id) on delete cascade,
  row_number       integer not null,
  raw              jsonb not null,
  status           text not null check (status in ('cadastro_criado', 'cadastro_atualizado', 'vinculado', 'duplicado', 'ignorado', 'erro')),
  party_id         uuid references public.parties (id),
  registration_id  uuid references public.party_registrations (id) on delete set null,
  receivable_id    uuid references public.receivables (id) on delete set null,
  charge_id        uuid references public.charges (id) on delete set null,
  message          text,
  created_at       timestamptz not null default now(),
  unique (batch_id, row_number)
);
create index import_rows_party_idx on public.import_rows (party_id);
create index import_rows_registration_idx on public.import_rows (registration_id);
create index import_rows_receivable_idx on public.import_rows (receivable_id);
create index import_rows_charge_idx on public.import_rows (charge_id);

alter table public.receivables
  add column import_batch_id uuid references public.import_batches (id),
  add column import_row_number integer,
  add column import_key text;
-- reimportar a mesma planilha não duplica lançamentos
create unique index receivables_import_key_uniq on public.receivables (import_key) where import_key is not null;
create index receivables_import_batch_idx on public.receivables (import_batch_id);

-- -----------------------------------------------------------------------------
-- 5. Unicidade sem diferenciar maiúsculas/espaços
-- -----------------------------------------------------------------------------
create unique index categories_name_ci_uniq on public.categories (type, lower(trim(name)));
create unique index services_name_ci_uniq on public.services (lower(trim(name)));

-- -----------------------------------------------------------------------------
-- Triggers padrão (updated_at e auditoria)
-- -----------------------------------------------------------------------------
create trigger party_registrations_touch before update on public.party_registrations
  for each row execute function private.touch_updated_at();
create trigger charges_touch before update on public.charges
  for each row execute function private.touch_updated_at();
create trigger party_registrations_audit after insert or update or delete on public.party_registrations
  for each row execute function private.audit_row();
create trigger charges_audit after insert or update or delete on public.charges
  for each row execute function private.audit_row();
create trigger import_batches_audit after insert or update or delete on public.import_batches
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.party_registrations enable row level security;
alter table public.charges             enable row level security;
alter table public.import_batches      enable row level security;
alter table public.import_rows         enable row level security;

create policy party_registrations_select on public.party_registrations for select to authenticated
  using ((select private.current_app_role()) is not null);
create policy party_registrations_insert on public.party_registrations for insert to authenticated
  with check ((select private.has_role('admin', 'financeiro')));
create policy party_registrations_update on public.party_registrations for update to authenticated
  using ((select private.has_role('admin', 'financeiro')))
  with check ((select private.has_role('admin', 'financeiro')));
create policy party_registrations_delete on public.party_registrations for delete to authenticated
  using ((select private.has_role('admin')));

create policy charges_select on public.charges for select to authenticated
  using ((select private.current_app_role()) is not null);
create policy charges_insert on public.charges for insert to authenticated
  with check ((select private.has_role('admin', 'financeiro')));
create policy charges_update on public.charges for update to authenticated
  using ((select private.has_role('admin', 'financeiro')))
  with check ((select private.has_role('admin', 'financeiro')));

create policy import_batches_select on public.import_batches for select to authenticated
  using ((select private.has_role('admin', 'financeiro')));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check ((select private.has_role('admin', 'financeiro')));
create policy import_batches_update on public.import_batches for update to authenticated
  using ((select private.has_role('admin', 'financeiro')))
  with check ((select private.has_role('admin', 'financeiro')));

create policy import_rows_select on public.import_rows for select to authenticated
  using ((select private.has_role('admin', 'financeiro')));
create policy import_rows_insert on public.import_rows for insert to authenticated
  with check ((select private.has_role('admin', 'financeiro')));

-- -----------------------------------------------------------------------------
-- Permissões explícitas
-- -----------------------------------------------------------------------------
revoke all on public.party_registrations, public.charges, public.import_batches, public.import_rows from anon, authenticated;
grant select, insert, update, delete on public.party_registrations to authenticated;
grant select, insert, update         on public.charges             to authenticated;
grant select, insert, update         on public.import_batches      to authenticated;
grant select, insert                 on public.import_rows         to authenticated;
grant select, insert, update, delete on public.party_registrations, public.charges, public.import_batches, public.import_rows to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on all sequences in schema public from anon;
-- import_rows usa identity: quem insere precisa da sequência
grant usage on sequence public.import_rows_id_seq to authenticated;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.has_role(public.app_role[]) to authenticated, service_role;
