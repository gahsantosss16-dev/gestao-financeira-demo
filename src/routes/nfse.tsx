import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, EmptyState, StatusBadge } from "@/components/ui/card";
import { ambienteFiscalPermitido, pendenciasEmissao } from "@/lib/nfse/prontidao";
import { ambiente } from "@/lib/supabase";
import { listarConfiguracoesNfse } from "@/services/nfse";

const ROTULO = { homologacao: "Homologação (testes)", producao: "Produção" } as const;

export function NfsePage() {
  const query = useQuery({ queryKey: ["nfse", "configuracao"], queryFn: listarConfiguracoesNfse });
  const permitidos = ambienteFiscalPermitido(ambiente);

  return (
    <>
      <PageHeader title="NFS-e" description="Integração com a NFS-e de Campo Grande/MS — em preparação" />
      <Card className="mb-4 flex gap-3 p-4 text-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p>
          A emissão ainda <strong>não está disponível</strong>. Esta tela mostra o que falta para habilitar os testes em homologação.
          Nenhuma nota é enviada à prefeitura nesta versão, e este ambiente só pode usar:{" "}
          <strong>{permitidos.map((a) => ROTULO[a]).join(" e ")}</strong>.
        </p>
      </Card>
      {query.isLoading ? (
        <EmptyState>Carregando…</EmptyState>
      ) : query.isError ? (
        <EmptyState>Não foi possível carregar a configuração fiscal.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["homologacao", "producao"] as const).map((amb) => {
            const config = query.data?.find((c) => c.ambiente === amb) ?? null;
            const pend = pendenciasEmissao(config, null, ambiente).filter((p) => !p.startsWith("Lançamento sem tomador"));
            return (
              <Card key={amb} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">{ROTULO[amb]}</h2>
                  <StatusBadge tone={pend.length ? "warning" : "success"}>{pend.length ? "Pendente" : "Pronto"}</StatusBadge>
                </div>
                {pend.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {pend.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Configuração completa e validada.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
