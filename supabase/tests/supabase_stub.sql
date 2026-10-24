-- Reproduz, num Postgres local, o ambiente do projeto Supabase cpepbgyycnbbfvtbzkgk
-- conforme inspecionado em 24/10/2026 (somente leitura). NÃO faz parte das migrações.
--
-- Pontos reproduzidos de propósito:
--   * tabelas criadas por `postgres` em public NÃO dão SELECT/INSERT/UPDATE/DELETE
--     a anon/authenticated (só TRUNCATE/REFERENCES/TRIGGER), como no projeto real;
--   * funções novas seguem o padrão do Postgres (PUBLIC pode executar), o pior caso;
--   * função public.rls_auto_enable() + event trigger ensure_rls, com EXECUTE para PUBLIC;
--   * storage.objects com RLS e grants padrão do Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema extensions;
create extension pgcrypto with schema extensions;

create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- privilégios padrão observados no projeto para tabelas criadas por postgres em public
alter default privileges for role postgres in schema public
  grant truncate, references, trigger on tables to anon, authenticated, service_role;

-- cópia da função criada pelo Supabase no projeto
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path to 'pg_catalog' as $$
declare cmd record; tbl name;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      select c.relname into tbl from pg_catalog.pg_class c where c.oid = cmd.objid;
      execute format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
    end if;
  end loop;
end $$;
create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
