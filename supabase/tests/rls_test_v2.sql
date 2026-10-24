-- Testes da migração 0002 (operação financeira, cobranças, IE e importação).
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'OK (bloqueado) %: %', label, sqlerrm; return; end;
  raise exception 'FALHA: % deveria ter sido bloqueado', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALHA: %', label; end if;
  raise notice 'OK %', label;
end $$;

-- usuários desta suíte
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@demo'),
  ('00000000-0000-0000-0000-0000000000f2', 'fin2@demo'),
  ('00000000-0000-0000-0000-0000000000c2', 'consulta2@demo');
update profiles set role = 'admin' where email = 'admin2@demo';
update profiles set role = 'financeiro' where email = 'fin2@demo';

select pg_temp.expect(not exists (
  select 1 from unnest(array['party_registrations','charges','import_batches','import_rows']) t,
                unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  where has_table_privilege('anon', 'public.' || t, p)), 'anon sem acesso às novas tabelas');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.receivable_payments', 'DELETE')
  and not has_table_privilege('authenticated', 'public.payable_payments', 'DELETE'), 'usuários não apagam pagamentos');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.charges', 'DELETE'), 'usuários não apagam cobranças');

-- ---------------------------------------------------------------- IE
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into parties (id, kind, person_type, name, document, rural_producer) values
  ('a0000000-0000-0000-0000-000000000001', 'cliente', 'PF', 'Produtor Demo Um', '52998224725', true);
insert into party_registrations (party_id, uf, ie, property_name, is_primary)
  values ('a0000000-0000-0000-0000-000000000001', 'MS', '283123459', 'Fazenda Demo A', true);
insert into party_registrations (party_id, uf, ie, property_name)
  values ('a0000000-0000-0000-0000-000000000001', 'MS', '283123467', 'Fazenda Demo B');
select pg_temp.expect((select count(*) from party_registrations where party_id = 'a0000000-0000-0000-0000-000000000001') = 2, 'mesmo CPF com duas propriedades/IEs');
select pg_temp.expect_error($$insert into party_registrations (party_id, uf, ie) values ('a0000000-0000-0000-0000-000000000001', 'MS', '283123459')$$, 'IE duplicada na mesma UF');
insert into parties (id, kind, person_type, name) values ('a0000000-0000-0000-0000-000000000002', 'cliente', 'PF', 'Outro Produtor');
insert into party_registrations (party_id, uf, ie) values ('a0000000-0000-0000-0000-000000000002', 'GO', '283123459');
select pg_temp.expect(true, 'mesma numeração em outra UF é permitida');
select pg_temp.expect_error($$insert into party_registrations (party_id, uf, ie, is_primary) values ('a0000000-0000-0000-0000-000000000001', 'MS', '283123475', true)$$, 'duas IEs principais no mesmo cadastro');
select pg_temp.expect_error($$insert into party_registrations (party_id, uf, ie) values ('a0000000-0000-0000-0000-000000000001', 'ms', '28.312.345-9')$$, 'IE fora do formato normalizado');
reset role;

-- ---------------------------------------------------------------- pagamentos
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into receivables (id, party_id, description, due_date, amount) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Mensalidade', current_date, 300);
insert into receivable_payments (id, receivable_id, paid_at, amount, method, client_request_id) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', current_date, 100, 'PIX', 'd0000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into receivable_payments (receivable_id, paid_at, amount, method, client_request_id) values ('b0000000-0000-0000-0000-000000000001', current_date, 100, 'PIX', 'd0000000-0000-0000-0000-000000000001')$$, 'mesma baixa enviada duas vezes (duplo clique)');
select pg_temp.expect((select paid_amount from receivables where id = 'b0000000-0000-0000-0000-000000000001') = 100, 'baixa parcial: saldo 200');
select pg_temp.expect_error($$update receivable_payments set amount = 300 where id = 'c0000000-0000-0000-0000-000000000001'$$, 'alterar valor de pagamento');
select pg_temp.expect_error($$update receivable_payments set reversal_reason = 'abc' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'estorno sem justificativa suficiente');
select pg_temp.expect_error($$insert into receivable_payments (receivable_id, paid_at, amount, method, reversal_reason, reversed_at) values ('b0000000-0000-0000-0000-000000000001', current_date, 10, 'PIX', 'já estornado', now())$$, 'inserir pagamento já estornado');
update receivable_payments set reversal_reason = 'Valor lançado no cliente errado' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.expect((select paid_amount from receivables where id = 'b0000000-0000-0000-0000-000000000001') = 0, 'estorno devolve o saldo');
select pg_temp.expect((select reversed_by from receivable_payments where id = 'c0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-0000000000f2', 'estorno registra quem estornou');
select pg_temp.expect_error($$update receivable_payments set reversal_reason = 'de novo, outro motivo' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'estornar duas vezes');
select pg_temp.expect_error($$delete from receivable_payments$$, 'apagar pagamento');
insert into receivable_payments (receivable_id, paid_at, amount, method) values ('b0000000-0000-0000-0000-000000000001', current_date, 300, 'Boleto');
select pg_temp.expect((select paid_amount from receivables where id = 'b0000000-0000-0000-0000-000000000001') = 300, 'baixa total após estorno');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$delete from receivables where id = 'b0000000-0000-0000-0000-000000000001'$$, 'admin excluir conta com pagamentos');
reset role;

-- contas a pagar: mesmas regras
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into payables (id, description, due_date, amount) values ('e0000000-0000-0000-0000-000000000001', 'Energia', current_date, 80);
insert into payable_payments (id, payable_id, paid_at, amount, method) values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', current_date, 80, 'PIX');
select pg_temp.expect((select paid_amount from payables where id = 'e0000000-0000-0000-0000-000000000001') = 80, 'conta a pagar quitada');
update payable_payments set reversal_reason = 'Pagamento devolvido pelo banco' where id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.expect((select paid_amount from payables where id = 'e0000000-0000-0000-0000-000000000001') = 0, 'estorno de pagamento a fornecedor');
reset role;

-- ---------------------------------------------------------------- cobranças
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into receivables (id, party_id, description, due_date, amount) values
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Taxa associativa', current_date + 10, 150);
insert into charges (receivable_id, party_id, description) values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '');
select pg_temp.expect((select code from charges where receivable_id = 'b0000000-0000-0000-0000-000000000002') ~ '^COB-[0-9]{4}-00001$', 'código sequencial gerado');
select pg_temp.expect((select party_id from charges where receivable_id = 'b0000000-0000-0000-0000-000000000002') = 'a0000000-0000-0000-0000-000000000001', 'cliente da cobrança vem da conta (não do formulário)');
select pg_temp.expect((select amount = 150 and description = 'Taxa associativa' from charges where receivable_id = 'b0000000-0000-0000-0000-000000000002'), 'valor e descrição herdados da conta');
select pg_temp.expect_error($$insert into charges (receivable_id, party_id, description) values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'dup')$$, 'segunda cobrança ativa para a mesma conta');
select pg_temp.expect_error($$update charges set code = 'COB-1999-00001'$$, 'alterar código da cobrança');
select pg_temp.expect_error($$insert into charges (receivable_id, party_id, description, amount) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'x', 999)$$, 'cobrança maior que a conta');
update charges set canceled_at = now(), cancel_reason = 'Emitida por engano' where receivable_id = 'b0000000-0000-0000-0000-000000000002';
insert into charges (receivable_id, party_id, description) values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '');
select pg_temp.expect((select count(*) from charges where receivable_id = 'b0000000-0000-0000-0000-000000000002') = 2
  and (select code from charges where receivable_id = 'b0000000-0000-0000-0000-000000000002' and canceled_at is null) ~ '00002$', 'nova cobrança após cancelamento, com novo número');
select pg_temp.expect_error($$update charges set canceled_at = null where cancel_reason = 'Emitida por engano'$$, 'reativar cobrança cancelada');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect((select count(*) from charges) = 2, 'consulta vê cobranças');
select pg_temp.expect_error($$insert into charges (receivable_id, party_id, description) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'x')$$, 'consulta criar cobrança');
select pg_temp.expect((select count(*) from import_batches) = 0, 'consulta não vê importações');
reset role;

-- ---------------------------------------------------------------- importação
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into import_batches (id, file_name, file_sha256, mapping) values
  ('f0000000-0000-0000-0000-000000000001', 'planilha-teste.xlsx', repeat('a', 64), '{"ie":"IE"}');
insert into receivables (party_id, description, due_date, amount, import_batch_id, import_row_number, import_key)
  values ('a0000000-0000-0000-0000-000000000001', 'Importado', current_date, 50, 'f0000000-0000-0000-0000-000000000001', 2, 'MS|283123459|2026-10|50.00');
select pg_temp.expect_error($$insert into receivables (party_id, description, due_date, amount, import_key) values ('a0000000-0000-0000-0000-000000000001', 'Reimportado', current_date, 50, 'MS|283123459|2026-10|50.00')$$, 'reimportação não duplica lançamento');
insert into import_rows (batch_id, row_number, raw, status, party_id) values
  ('f0000000-0000-0000-0000-000000000001', 2, '{"IE":"283123459"}', 'vinculado', 'a0000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from import_rows) = 1, 'linha de origem registrada');
select pg_temp.expect_error($$insert into import_batches (file_name, file_sha256, mapping) values ('x', 'nao-e-hash', '{}')$$, 'hash de arquivo inválido');
reset role;

-- ---------------------------------------------------------------- unicidade e perfil
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_error($$insert into categories (name, type) values ('  mensalidades de ASSOCIADOS ', 'receita')$$, 'categoria duplicada ignorando maiúsculas/espaços');
insert into categories (name, type) values ('Mensalidades de associados', 'despesa');
select pg_temp.expect(true, 'mesmo nome permitido em outro tipo');
select pg_temp.expect_error($$insert into services (name) values ('serviço DEMONSTRATIVO a')$$, 'serviço duplicado ignorando maiúsculas');
update profiles set full_name = 'Financeiro Dois' where id = auth.uid();
select pg_temp.expect((select full_name from profiles where id = auth.uid()) = 'Financeiro Dois', 'usuário altera o próprio nome');
select pg_temp.expect_error($$update profiles set email = 'outro@demo' where id = auth.uid()$$, 'usuário altera o próprio e-mail no perfil');
reset role;
\echo 'TESTES DA MIGRAÇÃO 0002 PASSARAM'
