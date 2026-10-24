// Reaproveitado do Neuro Hub Pro (src/auth/redirects.ts): impede open
// redirect após o login (//dominio-externo, barras invertidas).
export function isSafeInternalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function loginDestination(redirect: string | undefined, fallback = "/"): string {
  if (!redirect || !isSafeInternalPath(redirect)) return fallback;
  const pathname = redirect.split(/[?#]/, 1)[0];
  return pathname === "/login" ? fallback : redirect;
}
