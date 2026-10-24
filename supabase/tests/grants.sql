-- No Supabase estes grants já existem por padrão; aqui reproduzimos para o teste.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage on all sequences in schema public to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
