-- Dados DEMONSTRATIVOS (fictícios) para ambiente local/homologação.
-- Não contém dados reais da ASSOCIAPEC nem códigos tributários: os serviços
-- ficam com cTribMun vazio até a validação da contabilidade.

insert into public.categories (name, type) values
  ('Mensalidades de associados', 'receita'),
  ('Prestação de serviços', 'receita'),
  ('Eventos e cursos', 'receita'),
  ('Doações e patrocínios', 'receita'),
  ('Folha de pagamento', 'despesa'),
  ('Aluguel e condomínio', 'despesa'),
  ('Energia, água e internet', 'despesa'),
  ('Material de escritório', 'despesa'),
  ('Serviços de terceiros', 'despesa'),
  ('Impostos e taxas', 'despesa')
on conflict do nothing;

insert into public.services (name, description, default_amount) values
  ('Serviço demonstrativo A', 'Exemplo — substituir pelos serviços reais da ASSOCIAPEC', 350.00),
  ('Serviço demonstrativo B', 'Exemplo — substituir pelos serviços reais da ASSOCIAPEC', 1200.00);
