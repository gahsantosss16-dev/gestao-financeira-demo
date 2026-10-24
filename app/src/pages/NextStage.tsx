import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Callout, PageHead } from '../components/ui';

const CONTENT = {
  relatorios: {
    title: 'Relatórios',
    items: ['Contas a pagar e a receber por período', 'Fluxo de caixa realizado e previsto', 'Histórico de movimentações', 'Relatório por cliente/fornecedor', 'Exportação para Excel e PDF'],
  },
  importacao: {
    title: 'Importar planilhas',
    items: ['Envio de planilhas existentes (.xlsx/.csv)', 'Associação das colunas da planilha aos campos do sistema', 'Validação linha a linha antes de importar', 'Detecção de duplicidades por CPF/CNPJ e por lançamento', 'Relatório do que foi importado e do que foi rejeitado'],
  },
};

export function NextStage({ page }: { page: keyof typeof CONTENT }) {
  const c = CONTENT[page];
  return (
    <>
      <PageHead title={c.title} subtitle="Planejado para a Etapa 2 — funcionalidades financeiras" />
      <Callout tone="info" icon="clock">Este módulo ainda <b>não está disponível</b>. Ele será desenvolvido após a validação da Etapa 1.</Callout>
      <div className="card card-pad mt">
        <h3 className="mb">O que está previsto</h3>
        <ul className="list">{c.items.map((i) => <li key={i}><Icon name="check" />{i}</li>)}</ul>
        {page === 'importacao' && <p className="hint">A base já está preparada: CPF/CNPJ único no banco e validações compartilhadas com os formulários.</p>}
        <Link className="btn mt" to="/">Voltar ao painel</Link>
      </div>
    </>
  );
}
