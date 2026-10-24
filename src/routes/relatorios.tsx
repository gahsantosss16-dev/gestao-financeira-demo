import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { baixarCsv } from "@/lib/csv";
import { hojeIso, somarMeses } from "@/lib/datas";
import { formatCentavos } from "@/lib/money";
import { listarResumoMensal } from "@/services/lancamentos";

const nomeMes = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function RelatoriosPage() {
  const hoje = hojeIso();
  const [de, setDe] = useState(somarMeses(`${hoje.slice(0, 7)}-01`, -5).slice(0, 7));
  const [ate, setAte] = useState(hoje.slice(0, 7));
  const query = useQuery({
    queryKey: ["resumo", de, ate],
    queryFn: () => listarResumoMensal(`${de}-01`, `${ate}-01`),
  });

  const meses = [...new Set((query.data ?? []).map((r) => r.mes))].sort();
  const linha = (mes: string, tipo: "pagar" | "receber") => query.data?.find((r) => r.mes === mes && r.tipo === tipo);
  const linhas = meses.map((mes) => {
    const rec = linha(mes, "receber");
    const pag = linha(mes, "pagar");
    return {
      mes,
      receitaPrevista: rec?.previsto_centavos ?? 0,
      receitaRealizada: rec?.realizado_centavos ?? 0,
      despesaPrevista: pag?.previsto_centavos ?? 0,
      despesaRealizada: pag?.realizado_centavos ?? 0,
    };
  });

  function exportar() {
    baixarCsv(
      `resumo-${de}-a-${ate}.csv`,
      ["Mês", "Receita prevista", "Receita realizada", "Despesa prevista", "Despesa realizada", "Resultado realizado"],
      linhas.map((l) => [
        l.mes.slice(0, 7),
        reais(l.receitaPrevista),
        reais(l.receitaRealizada),
        reais(l.despesaPrevista),
        reais(l.despesaRealizada),
        reais(l.receitaRealizada - l.despesaRealizada),
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Previsto x realizado por mês de vencimento (cancelados não entram)"
        actions={
          <Button variant="outline" onClick={exportar} disabled={!linhas.length}>
            <Download /> CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="De" htmlFor="de" className="w-44">
          <Input id="de" type="month" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
        </Field>
        <Field label="Até" htmlFor="ate" className="w-44">
          <Input id="ate" type="month" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
        </Field>
      </div>
      <Card className="overflow-x-auto">
        {query.isLoading ? (
          <EmptyState>Carregando…</EmptyState>
        ) : query.isError ? (
          <EmptyState>Não foi possível carregar o relatório.</EmptyState>
        ) : !linhas.length ? (
          <EmptyState>Sem lançamentos no período.</EmptyState>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border text-right text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left">Mês</th>
                <th className="px-4 py-2.5">Receita prevista</th>
                <th className="px-4 py-2.5">Receita realizada</th>
                <th className="px-4 py-2.5">Despesa prevista</th>
                <th className="px-4 py-2.5">Despesa realizada</th>
                <th className="px-4 py-2.5">Resultado realizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-right tabular-nums">
              {linhas.map((l) => {
                const resultado = l.receitaRealizada - l.despesaRealizada;
                return (
                  <tr key={l.mes}>
                    <td className="px-4 py-2.5 text-left capitalize">{nomeMes(l.mes)}</td>
                    <td className="px-4 py-2.5">{formatCentavos(l.receitaPrevista)}</td>
                    <td className="px-4 py-2.5">{formatCentavos(l.receitaRealizada)}</td>
                    <td className="px-4 py-2.5">{formatCentavos(l.despesaPrevista)}</td>
                    <td className="px-4 py-2.5">{formatCentavos(l.despesaRealizada)}</td>
                    <td className={`px-4 py-2.5 font-semibold ${resultado < 0 ? "text-destructive" : "text-success"}`}>
                      {formatCentavos(resultado)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
