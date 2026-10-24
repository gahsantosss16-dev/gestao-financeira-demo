// Roda ANTES do build (ver "build" em package.json) e interrompe a publicação
// quando o ambiente aponta para o Supabase errado ou expõe uma chave secreta.
//
// Adaptado de neuro-hub-pro/scripts/assert-supabase-target.mjs: lá, um QA
// publicado sem a variável certa teria gravado no banco de PRODUÇÃO. Aqui a
// mesma proteção vale para development / qa / production, com os refs de cada
// ambiente em config/supabase-targets.json (refs são públicos, não segredos).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENVIRONMENTS = ["development", "qa", "production"];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function supabaseRefOf(url) {
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(hostOf(url));
  return match ? match[1] : "";
}

function decodeJwtRole(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

/** Uma chave que dá acesso total ao banco nunca pode ir para o navegador. */
export function isSecretSupabaseKey(key) {
  const value = String(key ?? "").trim();
  if (!value) return false;
  if (value.startsWith("sb_secret_")) return true;
  return decodeJwtRole(value) === "service_role";
}

/** Retorna a lista de violações (vazia quando o alvo é coerente). */
export function checkSupabaseTarget(env, targets) {
  const errors = [];
  const appEnv = String(env.VITE_APP_ENV ?? "").trim().toLowerCase();
  const ref = supabaseRefOf(env.VITE_SUPABASE_URL ?? "");

  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("VITE_") && isSecretSupabaseKey(value)) {
      errors.push(`${name} contém uma chave secreta (service_role). Use somente a chave pública anon/publishable.`);
    }
  }

  if (!ENVIRONMENTS.includes(appEnv)) {
    errors.push(`VITE_APP_ENV inválido: "${appEnv}" (use development, qa ou production).`);
    return errors;
  }
  if (!ref) {
    errors.push("VITE_SUPABASE_URL ausente ou fora do formato https://<ref>.supabase.co.");
    return errors;
  }

  const owner = ENVIRONMENTS.find((name) => (targets[name] ?? []).includes(ref));
  if (appEnv === "development") {
    if (owner && owner !== "development") {
      errors.push(`Desenvolvimento não pode usar o Supabase de ${owner} (${ref}).`);
    }
    return errors;
  }

  if (owner !== appEnv) {
    errors.push(
      `Destino ${appEnv} exige um Supabase cadastrado em config/supabase-targets.json para ${appEnv}; ${ref} ${
        owner ? `pertence a ${owner}` : "não está cadastrado"
      }.`,
    );
  }
  const appHost = hostOf(env.VITE_PUBLIC_APP_URL ?? "");
  if (appEnv === "production" && appHost.startsWith("qa.")) {
    errors.push(`Destino production, mas VITE_PUBLIC_APP_URL aponta para ${appHost}.`);
  }
  if (appEnv === "qa" && appHost && !appHost.startsWith("qa.") && appHost !== "localhost") {
    errors.push(`Destino qa, mas VITE_PUBLIC_APP_URL aponta para ${appHost}.`);
  }
  return errors;
}

export function findDuplicatedRefs(targets) {
  const seen = new Map();
  const duplicated = [];
  for (const name of ENVIRONMENTS) {
    for (const ref of targets[name] ?? []) {
      if (seen.has(ref)) duplicated.push(`${ref} (${seen.get(ref)} e ${name})`);
      else seen.set(ref, name);
    }
  }
  return duplicated;
}

async function main() {
  const { loadEnv } = await import("vite");
  const mode = process.env.MODE ?? "production";
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const targets = JSON.parse(readFileSync(new URL("../config/supabase-targets.json", import.meta.url), "utf8"));
  const errors = [
    ...findDuplicatedRefs(targets).map((item) => `Ref repetido entre ambientes: ${item}.`),
    ...checkSupabaseTarget(env, targets),
  ];
  if (errors.length) {
    console.error("[assert-supabase-target] Build bloqueado — ambiente Supabase incoerente:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`[assert-supabase-target] OK: ${env.VITE_APP_ENV} → ${supabaseRefOf(env.VITE_SUPABASE_URL ?? "")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
