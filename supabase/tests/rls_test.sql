-- Testes de RLS, triggers e regras de negócio do banco.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'OK (bloqueado) %: %', label, sqlerrm;
    return;
  end;
  raise exception 'FALHA: % deveria ter sido bloqueado', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALHA: %', label; end if;
  raise notice 'OK %', label;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões explícitas (modelo atual do Supabase)
-- ---------------------------------------------------------------------------
select pg_temp.expect(not exists (
  select 1 from pg_tables t, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where t.schemaname = 'public' and has_table_privilege('anon', format('public.%I', t.tablename), p)
), 'anon sem nenhum privilégio nas tabelas do sistema');
select pg_temp.expect(not exists (
  select 1 from pg_tables t, unnest(array['TRUNCATE','REFERENCES','TRIGGER']) p
  where t.schemaname = 'public' and has_table_privilege('authenticated', format('public.%I', t.tablename), p)
), 'authenticated sem TRUNCATE/REFERENCES/TRIGGER');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
  and not has_table_privilege('authenticated', 'public.nfse_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE')
  and not has_table_privilege('authenticated', 'public.fiscal_issuer', 'DELETE'), 'authenticated só com as operações necessárias');
select pg_temp.expect(has_table_privilege('service_role', 'public.nfse_requests', 'INSERT'), 'service_role grava histórico fiscal');
select pg_temp.expect((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'), 'RLS ativo em todas as tabelas');
select pg_temp.expect((select count(*) from pg_tables where schemaname = 'public') = 14, '14 tabelas criadas');
select pg_temp.expect(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon sem acesso ao schema privado');
select pg_temp.expect(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')
), 'anon não executa funções privadas');
select pg_temp.expect(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname not in ('has_role', 'current_app_role')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 'authenticated executa apenas has_role/current_app_role');
select pg_temp.expect(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'rls_auto_enable'), 'nenhuma função do sistema exposta em public');
select pg_temp.expect(not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'), 'rls_auto_enable não chamável pela API');
create table public.tmp_rls_check (id int);
select pg_temp.expect((select relrowsecurity from pg_class where oid = 'public.tmp_rls_check'::regclass), 'rls_auto_enable continua ativando RLS em tabelas novas');
drop table public.tmp_rls_check;

set role anon;
select pg_temp.expect_error($$select count(*) from public.parties$$, 'anon ler cadastros');
select pg_temp.expect_error($$select private.has_role('admin')$$, 'anon chamar função privada');
reset role;

-- usuários (o trigger cria os perfis como "consulta")
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@demo'),
  ('00000000-0000-0000-0000-00000000000f', 'fin@demo'),
  ('00000000-0000-0000-0000-0000000000f1', 'fiscal@demo'),
  ('00000000-0000-0000-0000-00000000000c', 'consulta@demo');
select pg_temp.expect((select count(*) from profiles where role = 'consulta') = 4, 'perfis criados como consulta');
update profiles set role = 'admin' where email = 'admin@demo';
update profiles set role = 'financeiro' where email = 'fin@demo';
update profiles set role = 'fiscal' where email = 'fiscal@demo';

-- consulta: lê, mas não escreve
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from categories) > 0, 'consulta lê categorias');
select pg_temp.expect_error($$insert into parties (kind, person_type, name) values ('cliente','PF','Teste')$$, 'consulta inserir cadastro');
select pg_temp.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'auto-promoção de papel');
select pg_temp.expect((select count(*) from profiles) = 1, 'consulta só vê o próprio perfil');
select pg_temp.expect((select count(*) from audit_log) = 0, 'consulta não lê auditoria');
reset role;

-- financeiro: cadastra e lança
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
insert into parties (id, kind, person_type, name, document) values
  ('10000000-0000-0000-0000-000000000001', 'cliente', 'PJ', 'Cliente Demo Ltda', '11222333000181');
select pg_temp.expect_error($$insert into parties (kind, person_type, name, document) values ('cliente','PJ','Duplicado','11222333000181')$$, 'CNPJ duplicado');
select pg_temp.expect_error($$insert into parties (kind, person_type, name, document) values ('cliente','PF','CPF errado','11222333000181')$$, 'CNPJ em pessoa física');
insert into receivables (id, party_id, description, due_date, amount, paid_amount)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mensalidade', current_date, 500, 999);
select pg_temp.expect((select paid_amount from receivables) = 0, 'paid_amount ignorado no insert');
insert into receivable_payments (receivable_id, paid_at, amount, method) values ('20000000-0000-0000-0000-000000000001', current_date, 200, 'PIX');
select pg_temp.expect((select paid_amount from receivables) = 200, 'pagamento parcial atualiza paid_amount');
select pg_temp.expect_error($$insert into receivable_payments (receivable_id, paid_at, amount, method) values ('20000000-0000-0000-0000-000000000001', current_date, 400, 'PIX')$$, 'pagamento acima do saldo');
select pg_temp.expect_error($$update receivables set paid_amount = 500$$, 'forjar paid_amount');
delete from receivables;
select pg_temp.expect((select count(*) from receivables) = 1, 'financeiro não exclui contas (RLS)');
select pg_temp.expect_error($$insert into nfse_documents (party_id, service_id, competence_date, amount, description, c_trib_mun) select '10000000-0000-0000-0000-000000000001', id, current_date, 10, 'x', '000' from services limit 1$$, 'financeiro criar NFS-e');
select pg_temp.expect_error($$update services set c_trib_mun = '999'$$, 'financeiro alterar cTribMun');
update services set default_amount = 400 where name = 'Serviço demonstrativo A';
select pg_temp.expect((select default_amount from services where name = 'Serviço demonstrativo A') = 400, 'financeiro altera dados não tributários do serviço');
update fiscal_issuer set legal_name = 'x';
select pg_temp.expect((select count(*) from fiscal_issuer where legal_name is not null) = 0, 'financeiro não edita emitente (RLS)');
reset role;

-- fiscal: rascunho permitido; status/produção/chave bloqueados
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into nfse_documents (id, party_id, service_id, competence_date, amount, description, c_trib_mun)
  select '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', id, current_date, 500, 'Serviço', 'PENDENTE' from services limit 1;
select pg_temp.expect_error($$update nfse_documents set status = 'autorizada'$$, 'fiscal marcar autorizada');
select pg_temp.expect_error($$update nfse_documents set chave_acesso = '123'$$, 'fiscal preencher chave de acesso');
select pg_temp.expect_error($$insert into nfse_documents (environment, party_id, service_id, competence_date, amount, description, c_trib_mun) select 'producao', '10000000-0000-0000-0000-000000000001', id, current_date, 10, 'x', '1' from services limit 1$$, 'fiscal criar registro de produção');
select pg_temp.expect_error($$insert into nfse_requests (environment, operation, http_method, url) values ('homologacao','emitir','POST','x')$$, 'fiscal gravar log de requisição');
select pg_temp.expect_error($$update services set tax_validated = true, c_trib_mun = null$$, 'validar serviço sem cTribMun');
update services set c_trib_mun = 'TESTE', tax_validated = true, tax_validated_by = 'Contabilidade (teste)' where name = 'Serviço demonstrativo B';
select pg_temp.expect_error($$update services set c_trib_mun = 'OUTRO' where name = 'Serviço demonstrativo B'$$, 'alterar código validado sem revalidar');
update fiscal_issuer set legal_name = 'ASSOCIAPEC (demonstração)' where environment = 'homologacao';
reset role;

-- backend (service_role) pode avançar status
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false) \gset ignored_
update nfse_documents set status = 'enviada', dps_id = 'DPS-TESTE';
insert into nfse_requests (nfse_document_id, environment, operation, http_method, url, http_status)
  values ('30000000-0000-0000-0000-000000000001', 'homologacao', 'emitir', 'POST', 'https://nfse2-cgr.dsfweb.com.br/notafiscal-ws/nfse', 501);
reset role;

-- admin: lê auditoria e exclui
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from audit_log where table_name = 'receivables') >= 2, 'auditoria registrou receivables');
select pg_temp.expect((select count(*) from nfse_requests) = 1, 'admin lê histórico fiscal');
select pg_temp.expect((select legal_name from fiscal_issuer where environment = 'homologacao') is not null, 'fiscal editou emitente');
select pg_temp.expect_error($$update profiles set role = 'consulta' where id = auth.uid()$$, 'admin rebaixar a si mesmo');
delete from receivable_payments;
select pg_temp.expect((select paid_amount from receivables) = 0, 'estorno recalcula paid_amount');
reset role;

-- storage: bucket privado
select pg_temp.expect((select not public from storage.buckets where id = 'comprovantes'), 'bucket comprovantes privado');
select pg_temp.expect((select not public from storage.buckets where id = 'fiscal-xml'), 'bucket fiscal-xml privado');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('comprovantes', 'payable/x/a.pdf')$$, 'consulta enviar comprovante');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('fiscal-xml', 'homologacao/x.xml')$$, 'usuário gravar XML fiscal');
reset role;

-- isolamento: usuário desativado e usuário sem perfil não veem nada
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'inativo@demo');
update profiles set active = false where email = 'inativo@demo';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from parties) = 0 and (select count(*) from receivables) = 0
  and (select count(*) from categories) = 0, 'usuário desativado não vê dados');
select pg_temp.expect_error($$insert into categories (name, type) values ('x', 'receita')$$, 'usuário desativado inserir');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select pg_temp.expect((select count(*) from parties) = 0 and (select count(*) from profiles) = 0, 'sessão sem perfil não vê dados');
select pg_temp.expect_error($$truncate public.parties cascade$$, 'authenticated executar TRUNCATE');
reset role;
\echo 'TODOS OS TESTES DE BANCO PASSARAM'
