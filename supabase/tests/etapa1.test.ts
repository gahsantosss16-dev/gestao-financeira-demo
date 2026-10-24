// Testa a migration da Etapa 1 em PostgreSQL real (PGlite), com dados
// sintéticos. Método reaproveitado do LSB (tests/p0/backend-security.test.ts).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const FINANCEIRO = "00000000-0000-0000-0000-0000000000f1";
const CONSULTA = "00000000-0000-0000-0000-0000000000c1";
const INATIVO = "00000000-0000-0000-0000-0000000000d1";
// CPF/CNPJ sintéticos com dígitos verificadores válidos.
const CPF_VALIDO = "52998224725";
const CNPJ_VALIDO = "11222333000181";

let db: PGlite;

type Row = Record<string, unknown>;

async function asUser(id: string) {
  await db.exec("RESET ROLE; SET ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function asOwner() {
  await db.exec("RESET ROLE;");
  await db.query("SELECT set_config('request.jwt.claims', '', false)");
}
async function rows<T = Row>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
async function rejected(sql: string, params: unknown[] = [], message?: RegExp) {
  await db.exec("SAVEPOINT tentativa");
  let failure: unknown;
  try {
    await db.query(sql, params);
  } catch (error) {
    failure = error;
  }
  await db.exec("ROLLBACK TO SAVEPOINT tentativa; RELEASE SAVEPOINT tentativa");
  expect(failure, `Esperava rejeição: ${sql}`).toBeTruthy();
  if (message) expect(String(failure)).toMatch(message);
}
async function novoLancamento(valor = 10000, tipo = "receber") {
  const [row] = await rows<{ id: string }>(
    `INSERT INTO lancamentos (tipo, descricao, competencia, vencimento, valor_centavos, chave_idempotencia)
     VALUES ($1, 'Mensalidade sintética', '2026-10-01', '2026-10-10', $2, $3) RETURNING id`,
    [tipo, valor, randomUUID()],
  );
  return row.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("supabase/tests/fixtures/supabase-auth-stub.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261024000100_etapa1_estrutura_financeira.sql", "utf8"));
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.invalid'), ('${FINANCEIRO}', 'fin@example.invalid'),
      ('${CONSULTA}', 'consulta@example.invalid'), ('${INATIVO}', 'inativo@example.invalid');
    UPDATE profiles SET papel = 'admin', ativo = true WHERE id = '${ADMIN}';
    UPDATE profiles SET papel = 'financeiro', ativo = true WHERE id = '${FINANCEIRO}';
    UPDATE profiles SET papel = 'consulta', ativo = true WHERE id = '${CONSULTA}';
  `);
}, 60000);
beforeEach(async () => {
  await db.exec("BEGIN");
  await asUser(FINANCEIRO);
});
afterEach(async () => {
  await db.exec("ROLLBACK; RESET ROLE");
});
afterAll(async () => {
  await db?.close();
});

describe("perfis e menor privilégio", () => {
  it("conta nova nasce inativa e somente consulta", async () => {
    await asOwner();
    const id = randomUUID();
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'novo@example.invalid')", [id]);
    const [perfil] = await rows<{ papel: string; ativo: boolean }>("SELECT papel, ativo FROM profiles WHERE id = $1", [id]);
    expect(perfil).toEqual({ papel: "consulta", ativo: false });
  });

  it("usuário inativo e anônimo não enxergam dados financeiros", async () => {
    await novoLancamento();
    await asUser(INATIVO);
    expect(await rows("SELECT id FROM lancamentos")).toHaveLength(0);
    await db.exec("RESET ROLE; SET ROLE anon;");
    await rejected("SELECT id FROM lancamentos", [], /permission denied/);
  });

  it("perfil consulta lê, mas não grava", async () => {
    await novoLancamento();
    await asUser(CONSULTA);
    expect(await rows("SELECT id FROM lancamentos")).toHaveLength(1);
    await rejected(
      `INSERT INTO lancamentos (tipo, descricao, competencia, vencimento, valor_centavos, chave_idempotencia)
       VALUES ('pagar', 'x', '2026-10-01', '2026-10-10', 100, $1)`,
      [randomUUID()],
      /row-level security/,
    );
  });

  it("somente admin altera perfis e ninguém altera o próprio papel", async () => {
    // RLS: o UPDATE de quem não é admin não alcança nenhuma linha.
    expect(await rows("UPDATE profiles SET papel = 'admin' WHERE id = $1 RETURNING id", [FINANCEIRO])).toHaveLength(0);
    expect((await rows("SELECT papel FROM profiles WHERE id = $1", [FINANCEIRO]))[0]).toEqual({ papel: "financeiro" });
    await asUser(ADMIN);
    await db.query("UPDATE profiles SET ativo = true WHERE id = $1", [INATIVO]);
    await rejected("UPDATE profiles SET papel = 'consulta' WHERE id = $1", [ADMIN], /próprio perfil/);
  });
});

describe("cadastro de pessoas", () => {
  it("valida CPF/CNPJ no servidor e bloqueia duplicidade", async () => {
    await db.query("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PF', $1, 'Associado sintético')", [CPF_VALIDO]);
    await db.query("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PJ', $1, 'Fornecedor sintético')", [CNPJ_VALIDO]);
    await rejected("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PF', $1, 'Duplicado')", [CPF_VALIDO], /pessoas_documento_unico/);
    await rejected("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PF', '52998224724', 'DV errado')", [], /check constraint/);
    await rejected("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PF', '11111111111', 'Repetido')", [], /check constraint/);
    await rejected("INSERT INTO pessoas (tipo_pessoa, documento, nome) VALUES ('PJ', $1, 'Tipo errado')", [CPF_VALIDO], /check constraint/);
  });

  it("não permite apagar registros financeiros", async () => {
    const [p] = await rows<{ id: string }>("INSERT INTO pessoas (tipo_pessoa, nome) VALUES ('PF', 'Sem documento') RETURNING id");
    await asUser(ADMIN);
    await rejected("DELETE FROM pessoas WHERE id = $1", [p.id], /permission denied/);
    const id = await novoLancamento();
    await rejected("DELETE FROM lancamentos WHERE id = $1", [id], /permission denied/);
  });
});

describe("lançamentos e baixas", () => {
  it("a mesma chave de idempotência não cria lançamento duplicado", async () => {
    const chave = randomUUID();
    const sql = `INSERT INTO lancamentos (tipo, descricao, competencia, vencimento, valor_centavos, chave_idempotencia)
                 VALUES ('pagar', 'Conta de luz', '2026-10-01', '2026-10-15', 25990, $1)`;
    await db.query(sql, [chave]);
    await rejected(sql, [chave], /chave_idempotencia/);
  });

  it("não permite forjar status ou valor pago por UPDATE direto", async () => {
    const id = await novoLancamento();
    await rejected("UPDATE lancamentos SET status = 'pago' WHERE id = $1", [id], /permission denied/);
    await rejected("UPDATE lancamentos SET valor_pago_centavos = 10000 WHERE id = $1", [id], /permission denied/);
    await rejected(
      `INSERT INTO lancamentos (tipo, descricao, competencia, vencimento, valor_centavos, chave_idempotencia, status)
       VALUES ('pagar', 'x', '2026-10-01', '2026-10-10', 100, $1, 'pago')`,
      [randomUUID()],
      /permission denied/,
    );
    await rejected("INSERT INTO baixas (lancamento_id, data_pagamento, valor_centavos, forma_pagamento, chave_idempotencia) VALUES ($1, '2026-10-10', 1, 'pix', $2)", [id, randomUUID()], /permission denied/);
  });

  it("baixa parcial, total, idempotência e saldo", async () => {
    const id = await novoLancamento(10000);
    const chave = randomUUID();
    await db.query("SELECT registrar_baixa($1, 4000, '2026-10-05', 'pix', null, $2)", [id, chave]);
    // Reenvio da mesma baixa (ex.: duplo clique) não soma de novo.
    await db.query("SELECT registrar_baixa($1, 4000, '2026-10-05', 'pix', null, $2)", [id, chave]);
    expect((await rows("SELECT status, valor_pago_centavos FROM lancamentos WHERE id = $1", [id]))[0]).toEqual({
      status: "parcial",
      valor_pago_centavos: 4000,
    });
    await rejected("SELECT registrar_baixa($1, 6001, '2026-10-06', 'pix', null, $2)", [id, randomUUID()], /saldo/);
    await db.query("SELECT registrar_baixa($1, 6000, '2026-10-06', 'boleto', null, $2)", [id, randomUUID()]);
    expect((await rows("SELECT status FROM lancamentos WHERE id = $1", [id]))[0]).toEqual({ status: "pago" });
  });

  it("valor de lançamento com baixa não muda; estorno exige motivo e reabre o saldo", async () => {
    const id = await novoLancamento(5000);
    const [{ registrar_baixa: baixa }] = await rows<{ registrar_baixa: { id: string } }>(
      "SELECT row_to_json(registrar_baixa($1, 5000, '2026-10-05', 'pix', null, $2)) AS registrar_baixa",
      [id, randomUUID()],
    );
    await rejected("UPDATE lancamentos SET valor_centavos = 9000 WHERE id = $1", [id], /baixas/);
    await rejected("SELECT estornar_baixa($1, '  ')", [baixa.id], /motivo/);
    await db.query("SELECT estornar_baixa($1, 'Pagamento devolvido')", [baixa.id]);
    await rejected("SELECT estornar_baixa($1, 'De novo')", [baixa.id], /já foi estornada/);
    expect((await rows("SELECT status, valor_pago_centavos FROM lancamentos WHERE id = $1", [id]))[0]).toEqual({
      status: "aberto",
      valor_pago_centavos: 0,
    });
  });

  it("cancelamento exige motivo, bloqueia com baixa ativa e congela o lançamento", async () => {
    const comBaixa = await novoLancamento(3000);
    await db.query("SELECT registrar_baixa($1, 1000, '2026-10-05', 'pix', null, $2)", [comBaixa, randomUUID()]);
    await rejected("SELECT cancelar_lancamento($1, 'Erro')", [comBaixa], /Estorne/);
    const id = await novoLancamento(3000);
    await rejected("SELECT cancelar_lancamento($1, '')", [id], /motivo/);
    await db.query("SELECT cancelar_lancamento($1, 'Lançado em duplicidade')", [id]);
    await rejected("UPDATE lancamentos SET descricao = 'x' WHERE id = $1", [id], /cancelado/);
    await rejected("SELECT registrar_baixa($1, 100, '2026-10-05', 'pix', null, $2)", [id, randomUUID()], /cancelado/);
  });

  it("perfil consulta não registra baixa nem cancela", async () => {
    const id = await novoLancamento();
    await asUser(CONSULTA);
    await rejected("SELECT registrar_baixa($1, 100, '2026-10-05', 'pix', null, $2)", [id, randomUUID()], /permissão/);
    await rejected("SELECT cancelar_lancamento($1, 'x')", [id], /permissão/);
  });
});

describe("auditoria", () => {
  it("registra operações e é imutável, visível só para admin", async () => {
    const id = await novoLancamento();
    await asUser(FINANCEIRO);
    expect(await rows("SELECT id FROM audit_log")).toHaveLength(0);
    await asUser(ADMIN);
    const eventos = await rows<{ acao: string; ator_id: string }>(
      "SELECT acao, ator_id FROM audit_log WHERE tabela = 'lancamentos' AND registro_id = $1",
      [id],
    );
    expect(eventos).toEqual([{ acao: "INSERT", ator_id: FINANCEIRO }]);
    await asOwner();
    await rejected("UPDATE audit_log SET acao = 'DELETE'", [], /imutáveis/);
    await rejected("DELETE FROM audit_log", [], /imutáveis/);
  });
});

describe("NFS-e preparada sem risco fiscal", () => {
  it("produção nasce desabilitada e não pode ser habilitada pelo cliente", async () => {
    await asUser(ADMIN);
    await db.query("INSERT INTO nfse_configuracao (ambiente, codigo_municipio_ibge) VALUES ('producao', '5002704')");
    await rejected("UPDATE nfse_configuracao SET producao_habilitada = true WHERE ambiente = 'producao'", [], /permission denied/);
    await rejected("UPDATE nfse_configuracao SET validada = true WHERE ambiente = 'producao'", [], /permission denied/);
    await asUser(FINANCEIRO);
    expect(await rows("UPDATE nfse_configuracao SET serie_dps = '1' WHERE ambiente = 'producao' RETURNING ambiente")).toHaveLength(0);
  });

  it("produção exige configuração validada e alteração fiscal invalida a validação", async () => {
    await asOwner();
    await rejected("INSERT INTO nfse_configuracao (ambiente, producao_habilitada) VALUES ('homologacao', true)", [], /nfse_producao/);
    await rejected("INSERT INTO nfse_configuracao (ambiente, producao_habilitada) VALUES ('producao', true)", [], /nfse_producao_exige_validacao/);
    await db.exec("INSERT INTO nfse_configuracao (ambiente, validada, producao_habilitada) VALUES ('producao', true, true)");
    await db.exec("UPDATE nfse_configuracao SET codigo_tributacao_nacional = '010101' WHERE ambiente = 'producao'");
    expect((await rows("SELECT validada, producao_habilitada FROM nfse_configuracao WHERE ambiente = 'producao'"))[0]).toEqual({
      validada: false,
      producao_habilitada: false,
    });
  });

  it("no máximo uma emissão ativa por lançamento e ambiente", async () => {
    const id = await novoLancamento();
    await rejected(
      "INSERT INTO nfse_emissoes (lancamento_id, ambiente, chave_idempotencia) VALUES ($1, 'homologacao', $2)",
      [id, randomUUID()],
      /permission denied/,
    );
    await asOwner();
    await db.query("INSERT INTO nfse_emissoes (lancamento_id, ambiente, chave_idempotencia, status) VALUES ($1, 'homologacao', $2, 'erro_comunicacao')", [id, randomUUID()]);
    await rejected(
      "INSERT INTO nfse_emissoes (lancamento_id, ambiente, chave_idempotencia) VALUES ($1, 'homologacao', $2)",
      [id, randomUUID()],
      /nfse_emissoes_uma_ativa_por_lancamento/,
    );
    await db.query("INSERT INTO nfse_emissoes (lancamento_id, ambiente, chave_idempotencia) VALUES ($1, 'producao', $2)", [id, randomUUID()]);
  });
});

describe("relatório", () => {
  it("resumo mensal ignora cancelados e respeita a RLS", async () => {
    await novoLancamento(10000);
    const cancelado = await novoLancamento(7000);
    await db.query("SELECT cancelar_lancamento($1, 'Teste')", [cancelado]);
    const [resumo] = await rows<{ previsto_centavos: string; quantidade: string }>(
      "SELECT previsto_centavos::text, quantidade::text FROM vw_resumo_mensal WHERE tipo = 'receber'",
    );
    expect(resumo).toEqual({ previsto_centavos: "10000", quantidade: "1" });
    await asUser(INATIVO);
    expect(await rows("SELECT * FROM vw_resumo_mensal")).toHaveLength(0);
  });
});
