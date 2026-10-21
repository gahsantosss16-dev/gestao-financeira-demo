# Recebe Fácil — Gestão financeira e cobrança (DEMONSTRAÇÃO)

Protótipo web **navegável** de um sistema de gestão financeira e cobrança de clientes, criado para
apresentação e validação com potenciais clientes.

> ⚠️ **Demonstração.** Todos os dados são **fictícios** e gerados no próprio navegador.
> Não há backend, banco de dados, integração com WhatsApp nem serviços pagos.
> Nenhuma mensagem ou cobrança real é enviada.

## O que é possível demonstrar

| Módulo | Fluxos |
| --- | --- |
| **Dashboard** | A receber (30 dias), recebido no mês, vencido, inadimplência, previsto x recebido, situação do mês, próximos vencimentos, maiores atrasos, atividade recente |
| **Clientes** | Cadastro, edição, busca (nome, CPF/CNPJ, telefone, e-mail, cidade), filtros por situação, ficha com parcelas, pagamentos, mensagens e histórico |
| **Contas a receber** | Nova cobrança com parcelamento (1–12x, mensal/quinzenal/semanal) e prévia das parcelas, filtros por status/período/cliente, renegociação de vencimento, exportação CSV |
| **Recorrências** | Mensalidades/contratos, receita recorrente mensal, pausar/reativar, gerar próximas cobranças |
| **Pagamentos** | Baixa total ou parcial, forma de pagamento, recibo (sem valor fiscal), estorno, histórico com filtros |
| **Alertas** | Vencem hoje, próximos 3 dias, atraso até 30 dias, inadimplência (+30 dias), cobrança em lote |
| **WhatsApp (simulação)** | Conversas em mockup de celular, modelos de mensagem com variáveis, status enviado/entregue/lido simulados, régua de cobrança automática configurável |
| **Relatórios** | Período (mês, 3/6 meses, ano, personalizado) e cliente; faturado x recebido, formas de pagamento, aging da carteira vencida, desempenho por cliente, CSV e impressão |

Também inclui tema claro/escuro, layout responsivo (menu lateral no computador, navegação inferior no celular)
e o botão **Restaurar dados**, que descarta as alterações feitas durante a apresentação.

## Executar localmente

É um site estático, sem dependências nem build:

```bash
npx http-server .      # ou: python3 -m http.server
```

Abra `http://localhost:8080`. As alterações ficam salvas apenas no `localStorage` do navegador
(e são regeneradas a cada novo dia para manter as datas atuais).

## Publicação

O workflow `.github/workflows/pages.yml` publica o conteúdo no **GitHub Pages** a cada push na `main`
(em *Settings → Pages*, a origem deve estar como **GitHub Actions**).

## Estrutura

```
index.html        # layout (banner de demonstração, menu, topo)
css/styles.css    # design system, tema claro/escuro e responsividade
js/data.js        # gerador determinístico de dados fictícios
js/app.js         # roteamento, telas, gráficos SVG, modais e simulações
```
