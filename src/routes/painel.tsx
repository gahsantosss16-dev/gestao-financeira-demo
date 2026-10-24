import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, EmptyState, StatCard } from "@/components/ui/card";
import { fimDoMes, formatDataBr, hojeIso, inicioDoMes } from "@/lib/datas";
import { saldoCentavos, situacao } from "@/lib/lancamentos";
import { formatCentavos } from "@/lib/money";
import { listarAtrasados, listarLancamentos } from "@/services/lancamentos";
import { SituacaoBadge } from "./lancamentos";

export function PainelPage() {
  const hoje = hojeIso();
  const mes = useQuery({
    queryKey: ["lancamentos", "mes", inicioDoMes(hoje)],
    queryFn: () => listarLancamentos({ inicio: inicioDoMes(hoje), fim: fimDoMes(hoje) }),
  });
  const atrasados = useQuery({ queryKey: ["lancamentos", "atrasados", hoje], queryFn: () => listarAtrasados(hoje) });

  const lista = (mes.data ?? []).filter((l) => l.status !== "cancelado");
  const soma = (tipo: "pagar" | "receber", campo: "valor_centavos" | "valor_pago_centavos") =>
    lista.filter((l) => l.tipo === tipo).reduce((t, l) => t + l[campo], 0);
  const atrasoReceber = (atrasados.data ?? []).filter((l) => l.tipo === "receber").reduce((t, l) => t + saldoCentavos(l), 0);
  const atrasoPagar = (atrasados.data ?? []).filter((l) => l.tipo === "pagar").reduce((t, l) => t + saldoCentavos(l), 0);
  const proximos = lista
    .filter((l) => (l.status === "aberto" || l.status === "parcial") && l.vencimento >= hoje)
    .slice(0, 8);

  return (
    <>
      <PageHeader title="Painel" description={`Resumo de ${formatDataBr(inicioDoMes(hoje))} a ${formatDataBr(fimDoMes(hoje))}`} />
      {mes.isError || atrasados.isError ? (
        <p role="alert" className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
          Não foi possível carregar os dados financeiros.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ArrowUpCircle} tone="success" label="A receber no mês" value={formatCentavos(soma("receber", "valor_centavos"))} footer={`Recebido: ${formatCentavos(soma("receber", "valor_pago_centavos"))}`} />
        <StatCard icon={ArrowDownCircle} tone="info" label="A pagar no mês" value={formatCentavos(soma("pagar", "valor_centavos"))} footer={`Pago: ${formatCentavos(soma("pagar", "valor_pago_centavos"))}`} />
        <StatCard icon={AlertTriangle} tone="warning" label="Recebimentos vencidos" value={formatCentavos(atrasoReceber)} />
        <StatCard icon={Wallet} tone="destructive" label="Pagamentos vencidos" value={formatCentavos(atrasoPagar)} />
      </div>

      <Card className="mt-6">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Próximos vencimentos do mês</h2>
        {mes.isLoading ? (
          <EmptyState>Carregando…</EmptyState>
        ) : proximos.length === 0 ? (
          <EmptyState>Nenhum vencimento em aberto até o fim do mês.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {proximos.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.descricao}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.tipo === "receber" ? "Receber de" : "Pagar a"} {l.pessoa?.nome ?? "—"} · {formatDataBr(l.vencimento)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SituacaoBadge situacao={situacao(l, hoje)} />
                  <span className="tabular-nums font-semibold">{formatCentavos(saldoCentavos(l))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
