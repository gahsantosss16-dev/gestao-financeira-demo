import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { podeEditarFinanceiro } from "@/auth/permissions";
import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, StatusBadge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Modal } from "@/components/ui/modal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { lookupCep } from "@/lib/cep";
import { consultarCnpj } from "@/lib/consulta-cnpj";
import { documentoValido, formatCep, formatDocumento, formatTelefone, onlyDigits } from "@/lib/documento";
import { mensagemDeErro } from "@/lib/erros";
import { bloquearEnterComoSubmit } from "@/lib/form-enter-guard";
import { listarPessoas, salvarPessoa, type Pessoa, type PessoaInput } from "@/services/cadastros";

const PAPEIS = [
  ["associado", "Associado"],
  ["cliente", "Cliente"],
  ["fornecedor", "Fornecedor"],
] as const;

export function PessoasPage() {
  const { perfil } = useAuth();
  const podeEditar = perfil ? podeEditarFinanceiro(perfil.papel) : false;
  const [busca, setBusca] = useState("");
  const buscaDebounced = useDebouncedValue(busca, 300);
  const [editando, setEditando] = useState<Pessoa | "nova" | null>(null);
  const query = useQuery({ queryKey: ["pessoas", buscaDebounced], queryFn: () => listarPessoas(buscaDebounced) });

  return (
    <>
      <PageHeader
        title="Pessoas"
        description="Associados, clientes e fornecedores"
        actions={
          podeEditar ? (
            <Button onClick={() => setEditando("nova")}>
              <Plus /> Novo cadastro
            </Button>
          ) : null
        }
      />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Buscar por nome ou CPF/CNPJ"
          placeholder="Buscar por nome ou CPF/CNPJ…"
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <Card className="overflow-x-auto">
        {query.isLoading ? (
          <EmptyState>Carregando…</EmptyState>
        ) : query.isError ? (
          <EmptyState>Não foi possível carregar os cadastros.</EmptyState>
        ) : !query.data?.length ? (
          <EmptyState>{busca ? "Nenhum cadastro encontrado." : "Nenhum cadastro ainda."}</EmptyState>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">CPF/CNPJ</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Vínculos</th>
                {podeEditar ? <th className="px-4 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.map((p) => (
                <tr key={p.id} className={p.ativo ? "" : "opacity-60"}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.nome}</div>
                    {p.cidade ? <div className="text-xs text-muted-foreground">{p.cidade}/{p.uf}</div> : null}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDocumento(p.documento) || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div>{formatTelefone(p.telefone)}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {p.papeis.map((papel) => (
                        <StatusBadge key={papel}>{PAPEIS.find(([v]) => v === papel)?.[1] ?? papel}</StatusBadge>
                      ))}
                      {!p.ativo ? <StatusBadge tone="muted">Inativo</StatusBadge> : null}
                    </div>
                  </td>
                  {podeEditar ? (
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                        <Pencil />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editando ? <PessoaModal pessoa={editando === "nova" ? null : editando} onClose={() => setEditando(null)} /> : null}
    </>
  );
}

const VAZIO: PessoaInput = {
  tipo_pessoa: "PF",
  documento: null,
  nome: "",
  nome_fantasia: null,
  email: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  codigo_municipio_ibge: null,
  papeis: ["associado"],
  observacoes: null,
  ativo: true,
};

function PessoaModal({ pessoa, onClose }: { pessoa: Pessoa | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Estado único do formulário (padrão "não perder dados ao editar"): cada
  // campo guarda o que foi digitado; máscaras são aplicadas só na exibição.
  const [form, setForm] = useState<PessoaInput>(() => {
    if (!pessoa) return VAZIO;
    const { id: _id, ...resto } = pessoa;
    void _id;
    return resto;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const set = <K extends keyof PessoaInput>(key: K, value: PessoaInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const texto = (v: string) => (v.trim() ? v : null);

  const docDigitos = onlyDigits(form.documento);
  const docEsperado = form.tipo_pessoa === "PF" ? 11 : 14;
  const docErro =
    docDigitos.length === 0
      ? null
      : docDigitos.length !== docEsperado
        ? `${form.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} incompleto.`
        : documentoValido(docDigitos)
          ? null
          : `${form.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} inválido.`;

  async function buscarCep() {
    if (onlyDigits(form.cep).length !== 8) return;
    setConsultando(true);
    const info = await lookupCep(form.cep ?? "");
    setConsultando(false);
    if (!info) {
      toast.error("CEP não encontrado. Preencha o endereço manualmente.");
      return;
    }
    // Só completa campos vazios: nunca sobrescreve o que o usuário digitou.
    setForm((f) => ({
      ...f,
      logradouro: f.logradouro || info.rua || null,
      bairro: f.bairro || info.bairro || null,
      cidade: f.cidade || info.cidade || null,
      uf: f.uf || info.estado || null,
      codigo_municipio_ibge: f.codigo_municipio_ibge || info.codigoMunicipio || null,
    }));
  }

  async function buscarCnpj() {
    setConsultando(true);
    try {
      const d = await consultarCnpj(docDigitos);
      setForm((f) => ({
        ...f,
        nome: f.nome || d.razaoSocial,
        nome_fantasia: f.nome_fantasia || d.fantasia || null,
        email: f.email || d.email || null,
        telefone: f.telefone || (d.telefone.length >= 10 ? d.telefone.slice(0, 11) : null),
        cep: f.cep || d.cep || null,
        logradouro: f.logradouro || d.rua || null,
        numero: f.numero || d.numero || null,
        complemento: f.complemento || d.complemento || null,
        bairro: f.bairro || d.bairro || null,
        cidade: f.cidade || d.cidade || null,
        uf: f.uf || d.estado || null,
        codigo_municipio_ibge: f.codigo_municipio_ibge || d.codigoMunicipio || null,
      }));
      toast.success("Dados públicos do CNPJ preenchidos. Confira antes de salvar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consulta indisponível.");
    } finally {
      setConsultando(false);
    }
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarPessoa(pessoa?.id ?? null, {
        ...form,
        nome: form.nome.trim(),
        documento: docDigitos || null,
        telefone: onlyDigits(form.telefone) || null,
        cep: onlyDigits(form.cep) || null,
        uf: form.uf ? form.uf.toUpperCase() : null,
        email: form.email?.trim() || null,
      }),
    onSuccess: async () => {
      toast.success("Cadastro salvo.");
      await queryClient.invalidateQueries({ queryKey: ["pessoas"] });
      await queryClient.invalidateQueries({ queryKey: ["opcoes", "pessoas"] });
      onClose();
    },
    onError: (error) => setErro(mensagemDeErro(error as { code?: string; message?: string })),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!form.nome.trim()) return setErro("Informe o nome.");
    if (docErro) return setErro(docErro);
    if (!form.papeis.length) return setErro("Marque ao menos um vínculo.");
    salvar.mutate();
  }

  return (
    <Modal
      open
      title={pessoa ? "Editar cadastro" : "Novo cadastro"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="pessoa" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id="pessoa" onSubmit={submit} onKeyDown={bloquearEnterComoSubmit} className="grid gap-4 sm:grid-cols-6">
        <Field label="Tipo" htmlFor="tipo" className="sm:col-span-2">
          <Select id="tipo" value={form.tipo_pessoa} onChange={(e) => set("tipo_pessoa", e.target.value as "PF" | "PJ")}>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field label={form.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} htmlFor="documento" error={docErro} className="sm:col-span-4">
          <div className="flex gap-2">
            <MaskedInput
              id="documento"
              digits={form.documento}
              maxDigits={docEsperado}
              format={formatDocumento}
              onDigitsChange={(v) => set("documento", v)}
            />
            {form.tipo_pessoa === "PJ" ? (
              <Button variant="outline" disabled={docDigitos.length !== 14 || !!docErro || consultando} onClick={() => void buscarCnpj()}>
                Consultar
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label={form.tipo_pessoa === "PF" ? "Nome completo" : "Razão social"} htmlFor="nome" className="sm:col-span-6">
          <Input id="nome" required maxLength={200} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="email" className="sm:col-span-3">
          <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", texto(e.target.value))} />
        </Field>
        <Field label="Telefone" htmlFor="telefone" className="sm:col-span-3">
          <MaskedInput
            id="telefone"
            inputMode="tel"
            digits={form.telefone}
            maxDigits={11}
            format={formatTelefone}
            onDigitsChange={(v) => set("telefone", v)}
          />
        </Field>
        <Field label="CEP" htmlFor="cep" className="sm:col-span-2" hint={consultando ? "Consultando…" : undefined}>
          <MaskedInput
            id="cep"
            digits={form.cep}
            maxDigits={8}
            format={formatCep}
            onDigitsChange={(v) => set("cep", v)}
            onBlur={() => void buscarCep()}
          />
        </Field>
        <Field label="Logradouro" htmlFor="logradouro" className="sm:col-span-4">
          <Input id="logradouro" value={form.logradouro ?? ""} onChange={(e) => set("logradouro", texto(e.target.value))} />
        </Field>
        <Field label="Número" htmlFor="numero" className="sm:col-span-2">
          <Input id="numero" value={form.numero ?? ""} onChange={(e) => set("numero", texto(e.target.value))} />
        </Field>
        <Field label="Bairro" htmlFor="bairro" className="sm:col-span-4">
          <Input id="bairro" value={form.bairro ?? ""} onChange={(e) => set("bairro", texto(e.target.value))} />
        </Field>
        <Field label="Cidade" htmlFor="cidade" className="sm:col-span-4">
          <Input id="cidade" value={form.cidade ?? ""} onChange={(e) => set("cidade", texto(e.target.value))} />
        </Field>
        <Field label="UF" htmlFor="uf" className="sm:col-span-2">
          <Input id="uf" maxLength={2} value={form.uf ?? ""} onChange={(e) => set("uf", texto(e.target.value.toUpperCase()))} />
        </Field>
        <fieldset className="sm:col-span-6">
          <legend className="mb-1.5 text-sm font-medium">Vínculos</legend>
          <div className="flex flex-wrap gap-4">
            {PAPEIS.map(([valor, rotulo]) => (
              <label key={valor} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.papeis.includes(valor)}
                  onChange={(e) =>
                    set("papeis", e.target.checked ? [...form.papeis, valor] : form.papeis.filter((p) => p !== valor))
                  }
                />
                {rotulo}
              </label>
            ))}
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
              Ativo
            </label>
          </div>
        </fieldset>
        {erro ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-6">
            {erro}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
