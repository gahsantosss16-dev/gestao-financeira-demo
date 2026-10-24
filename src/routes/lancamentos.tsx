import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, HandCoins, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { podeEditarFinanceiro } from "@/auth/permissions";
import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, StatusBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { fimDoMes, formatDataBr, hojeIso, inicioDoMes } from "@/lib/datas";
import { mensagemDeErro } from "@/lib/erros";
import { bloquearEnterComoSubmit } from "@/lib/form-enter-guard";
import { montarParcelas, saldoCentavos, situacao, type Lancamento, type SituacaoExibida, type TipoLancamento } from "@/lib/lancamentos";
import { formatCentavos } from "@/lib/money";
import { baixarCsv } from "@/lib/csv";
import { listarCategorias, listarContas, listarOpcoesPessoas } from "@/services/cadastros";
import { cancelarLancamento, criarLancamentos, listarLancamentos, registrarBaixa } from "@/services/lancamentos";

const SITUACAO: Record<SituacaoExibida, { rotulo: string; tone: "success" | "warning" | "destructive" | "info" | "muted" }> = {
  aberto: { rotulo: "Em aberto", tone: "info" },
  parcial: { rotulo: "Parcial", tone: "warning" },
  pago: { rotulo: "Quitado", tone: "success" },
  vencido: { rotulo: "Vencido", tone: "destructive" },
  cancelado: { rotulo: "Cancelado", tone: "muted" },
};

export function SituacaoBadge({ situacao: s }: { situacao: SituacaoExibida }) {
  return <StatusBadge tone={SITUACAO[s].tone}>{SITUACAO[s].rotulo}</StatusBadge>;
}

const FORMAS = [
  ["pix", "PIX"],
  ["boleto", "Boleto"],
  ["transferencia", "Transferência"],
  ["dinheiro", "Dinheiro"],
  ["cartao", "Cartão"],
  ["debito_automatico", "Débito automático"],
  ["outro", "Outro"],
] as const;

function mensagemErro(error: unknown) {
  return mensagemDeErro(error as { code?: string; message?: string });
}

export function LancamentosPage({ tipo }: { tipo: TipoLancamento }) {
  const { perfil } = useAuth();
  const podeEditar = perfil ? podeEditarFinanceiro(perfil.papel) : false;
  const hoje = hojeIso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [filtroSituacao, setFiltroSituacao] = useState<"" | SituacaoExibida>("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [baixa, setBaixa] = useState<Lancamento | null>(null);
  const [cancelar, setCancelar] = useState<Lancamento | null>(null);

  const inicio = inicioDoMes(`${mes}-01`);
  const fim = fimDoMes(`${mes}-01`);
  const query = useQuery({
    queryKey: ["lancamentos", tipo, inicio],
    queryFn: () => listarLancamentos({ tipo, inicio, fim }),
  });
  const lista = useMemo(
    () => (query.data ?? []).filter((l) => !filtroSituacao || situacao(l, hoje) === filtroSituacao),
    [query.data, filtroSituacao, hoje],
  );
  const totalAberto = lista.reduce((t, l) => t + saldoCentavos(l), 0);
  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";

  function exportar() {
    baixarCsv(
      `${tipo}-${mes}.csv`,
      ["Vencimento", "Descrição", "Pessoa", "Categoria", "Valor", "Pago", "Saldo", "Situação"],
      lista.map((l) => [
        formatDataBr(l.vencimento),
        l.descricao,
        l.pessoa?.nome ?? "",
        l.categoria?.nome ?? "",
        (l.valor_centavos / 100).toFixed(2).replace(".", ","),
        (l.valor_pago_centavos / 100).toFixed(2).replace(".", ","),
        (saldoCentavos(l) / 100).toFixed(2).replace(".", ","),
        SITUACAO[situacao(l, hoje)].rotulo,
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title={titulo}
        description={`Saldo em aberto na seleção: ${formatCentavos(totalAberto)}`}
        actions={
          <>
            <Button variant="outline" onClick={exportar} disabled={!lista.length}>
              <Download /> CSV
            </Button>
            {podeEditar ? (
              <Button onClick={() => setNovoAberto(true)}>
                <Plus /> Novo lançamento
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Mês de vencimento" htmlFor="mes" className="w-44">
          <Input id="mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </Field>
        <Field label="Situação" htmlFor="situacao" className="w-44">
          <Select id="situacao" value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value as "" | SituacaoExibida)}>
            <option value="">Todas</option>
            {Object.entries(SITUACAO).map(([valor, { rotulo }]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card className="overflow-x-auto">
        {query.isLoading ? (
          <EmptyState>Carregando…</EmptyState>
        ) : query.isError ? (
          <EmptyState>Não foi possível carregar os lançamentos.</EmptyState>
        ) : lista.length === 0 ? (
          <EmptyState>Nenhum lançamento neste período.</EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-border md:hidden">
            {lista.map((l) => (
              <li key={l.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{l.descricao}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDataBr(l.vencimento)} · {l.pessoa?.nome ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatCentavos(saldoCentavos(l))}</div>
                    <SituacaoBadge situacao={situacao(l, hoje)} />
                  </div>
                </div>
                {podeEditar ? <AcoesLancamento lancamento={l} onBaixa={setBaixa} onCancelar={setCancelar} /> : null}
              </li>
            ))}
          </ul>
          <table className="hidden w-full min-w-[720px] text-sm md:table">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">{tipo === "receber" ? "Pagador" : "Favorecido"}</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5 text-right">Saldo</th>
                <th className="px-4 py-2.5">Situação</th>
                {podeEditar ? <th className="px-4 py-2.5 text-right">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((l) => {
                const s = situacao(l, hoje);
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 tabular-nums">{formatDataBr(l.vencimento)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{l.descricao}</div>
                      {l.categoria?.nome ? <div className="text-xs text-muted-foreground">{l.categoria.nome}</div> : null}
                    </td>
                    <td className="px-4 py-2.5">{l.pessoa?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCentavos(l.valor_centavos)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCentavos(saldoCentavos(l))}</td>
                    <td className="px-4 py-2.5">
                      <SituacaoBadge situacao={s} />
                    </td>
                    {podeEditar ? (
                      <td className="px-4 py-2.5">
                        <AcoesLancamento lancamento={l} onBaixa={setBaixa} onCancelar={setCancelar} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </Card>

      {novoAberto ? <NovoLancamentoModal tipo={tipo} onClose={() => setNovoAberto(false)} /> : null}
      {baixa ? <BaixaModal lancamento={baixa} onClose={() => setBaixa(null)} /> : null}
      {cancelar ? <CancelarModal lancamento={cancelar} onClose={() => setCancelar(null)} /> : null}
    </>
  );
}

function AcoesLancamento({
  lancamento: l,
  onBaixa,
  onCancelar,
}: {
  lancamento: Lancamento;
  onBaixa: (l: Lancamento) => void;
  onCancelar: (l: Lancamento) => void;
}) {
  const aberto = l.status === "aberto" || l.status === "parcial";
  return (
    <div className="flex justify-end gap-1">
      {aberto ? (
        <Button size="sm" variant="outline" onClick={() => onBaixa(l)}>
          <HandCoins /> {l.tipo === "receber" ? "Receber" : "Pagar"}
        </Button>
      ) : null}
      {l.status === "aberto" ? (
        <Button size="sm" variant="ghost" onClick={() => onCancelar(l)} aria-label={`Cancelar ${l.descricao}`}>
          <Ban />
        </Button>
      ) : null}
    </div>
  );
}

function NovoLancamentoModal({ tipo, onClose }: { tipo: TipoLancamento; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Gerada uma única vez por formulário: reenvio não duplica (ver montarParcelas).
  const [chave] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    descricao: "",
    pessoa_id: "",
    categoria_id: "",
    competencia: "",
    primeiroVencimento: hojeIso(),
    valorTotalCentavos: 0,
    parcelas: 1,
    documento_ref: "",
    observacoes: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const pessoas = useQuery({ queryKey: ["opcoes", "pessoas"], queryFn: listarOpcoesPessoas });
  const categorias = useQuery({
    queryKey: ["opcoes", "categorias", tipo],
    queryFn: () => listarCategorias(tipo === "receber" ? "receita" : "despesa"),
  });

  const previa = useMemo(() => {
    try {
      return montarParcelas(
        { ...form, tipo, pessoa_id: form.pessoa_id || null, categoria_id: form.categoria_id || null, competencia: form.competencia ? `${form.competencia}-01` : "" },
        chave,
      );
    } catch {
      return [];
    }
  }, [form, tipo, chave]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.descricao.trim()) throw new Error("Informe a descrição.");
      if (form.valorTotalCentavos <= 0) throw new Error("Informe um valor maior que zero.");
      if (!previa.length) throw new Error("Revise os dados do lançamento.");
      await criarLancamentos(previa);
    },
    onSuccess: async () => {
      toast.success(previa.length > 1 ? `${previa.length} parcelas lançadas.` : "Lançamento salvo.");
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      onClose();
    },
    onError: (error) => setErro(error instanceof Error && !("code" in error) ? error.message : mensagemErro(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    salvar.mutate();
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open
      title={tipo === "receber" ? "Nova conta a receber" : "Nova conta a pagar"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="novo-lancamento" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id="novo-lancamento" onSubmit={submit} onKeyDown={bloquearEnterComoSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição" htmlFor="descricao" className="sm:col-span-2">
          <Input id="descricao" required maxLength={200} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </Field>
        <Field label={tipo === "receber" ? "Pagador" : "Favorecido"} htmlFor="pessoa">
          <Select id="pessoa" value={form.pessoa_id} onChange={(e) => set("pessoa_id", e.target.value)}>
            <option value="">— Não informado —</option>
            {(pessoas.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Categoria" htmlFor="categoria">
          <Select id="categoria" value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
            <option value="">— Sem categoria —</option>
            {(categorias.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor total" htmlFor="valor">
          <MoneyInput id="valor" valueCentavos={form.valorTotalCentavos} onValueCentavosChange={(v) => set("valorTotalCentavos", v)} />
        </Field>
        <Field label="Parcelas (mensais)" htmlFor="parcelas">
          <Input
            id="parcelas"
            type="number"
            min={1}
            max={120}
            value={form.parcelas}
            onChange={(e) => set("parcelas", Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
          />
        </Field>
        <Field label="Primeiro vencimento" htmlFor="vencimento">
          <Input id="vencimento" type="date" required value={form.primeiroVencimento} onChange={(e) => set("primeiroVencimento", e.target.value)} />
        </Field>
        <Field label="Competência" htmlFor="competencia" hint="Se vazio, usa o mês do vencimento.">
          <Input id="competencia" type="month" value={form.competencia} onChange={(e) => set("competencia", e.target.value)} />
        </Field>
        <Field label="Documento (nº NF, boleto…)" htmlFor="docref" className="sm:col-span-2">
          <Input id="docref" maxLength={100} value={form.documento_ref} onChange={(e) => set("documento_ref", e.target.value)} />
        </Field>
        <Field label="Observações" htmlFor="obs" className="sm:col-span-2">
          <textarea
            id="obs"
            rows={2}
            maxLength={1000}
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
          />
        </Field>
        {previa.length > 1 ? (
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-medium">Prévia das parcelas</div>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-border text-sm">
              {previa.map((p) => (
                <li key={p.chave_idempotencia} className="flex justify-between border-b border-border px-3 py-1.5 last:border-0">
                  <span>
                    {p.parcela_numero}/{p.parcela_total} · {formatDataBr(p.vencimento)}
                  </span>
                  <span className="tabular-nums">{formatCentavos(p.valor_centavos)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {erro ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {erro}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function BaixaModal({ lancamento, onClose }: { lancamento: Lancamento; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [chave] = useState(() => crypto.randomUUID());
  const saldo = saldoCentavos(lancamento);
  const [valor, setValor] = useState(saldo);
  const [data, setData] = useState(hojeIso());
  const [forma, setForma] = useState("pix");
  const [contaId, setContaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const contas = useQuery({ queryKey: ["opcoes", "contas"], queryFn: listarContas });

  const salvar = useMutation({
    mutationFn: () => registrarBaixa({ lancamentoId: lancamento.id, valorCentavos: valor, data, forma, contaId: contaId || null, chave }),
    onSuccess: async () => {
      toast.success(valor < saldo ? "Baixa parcial registrada." : "Lançamento quitado.");
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      onClose();
    },
    onError: (error) => setErro(mensagemErro(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (valor <= 0 || valor > saldo) {
      setErro(`Informe um valor entre R$ 0,01 e ${formatCentavos(saldo)}.`);
      return;
    }
    salvar.mutate();
  }

  return (
    <Modal
      open
      title={lancamento.tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="baixa" disabled={salvar.isPending}>
            {salvar.isPending ? "Registrando…" : "Confirmar"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {lancamento.descricao} · saldo {formatCentavos(saldo)}
      </p>
      <form id="baixa" onSubmit={submit} onKeyDown={bloquearEnterComoSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor" htmlFor="baixa-valor">
          <MoneyInput id="baixa-valor" valueCentavos={valor} onValueCentavosChange={setValor} />
        </Field>
        <Field label="Data" htmlFor="baixa-data">
          <Input id="baixa-data" type="date" required value={data} max={hojeIso()} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Forma" htmlFor="baixa-forma">
          <Select id="baixa-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
            {FORMAS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Conta" htmlFor="baixa-conta">
          <Select id="baixa-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">— Não informada —</option>
            {(contas.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        {erro ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {erro}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function CancelarModal({ lancamento, onClose }: { lancamento: Lancamento; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => cancelarLancamento(lancamento.id, motivo),
    onSuccess: async () => {
      toast.success("Lançamento cancelado.");
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      onClose();
    },
    onError: (error) => setErro(mensagemErro(error)),
  });
  return (
    <Modal
      open
      title="Cancelar lançamento"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" disabled={!motivo.trim() || salvar.isPending} onClick={() => salvar.mutate()}>
            Cancelar lançamento
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        <strong>{lancamento.descricao}</strong> ({formatCentavos(lancamento.valor_centavos)}) ficará registrado como cancelado. Nada é
        apagado.
      </p>
      <Field label="Motivo" htmlFor="motivo" error={erro}>
        <Input id="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
    </Modal>
  );
}
