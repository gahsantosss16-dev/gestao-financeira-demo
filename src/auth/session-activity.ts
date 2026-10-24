// Reaproveitado do Neuro Hub Pro (src/auth/session-activity.ts): encerra a
// sessão após inatividade. "Sem registro" não é tratado como expirado (lição
// de lá: derrubava sessões recém-restauradas).
export const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

const STORAGE_PREFIX = "associapec-financeiro:last-activity";

function getStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readLastActivity(userId: string): number | null {
  const value = getStorage()?.getItem(`${STORAGE_PREFIX}:${userId}`);
  if (!value) return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function writeLastActivity(userId: string, timestamp = Date.now()): void {
  try {
    getStorage()?.setItem(`${STORAGE_PREFIX}:${userId}`, String(timestamp));
  } catch {
    // armazenamento indisponível: a sessão continua controlada pelo Supabase
  }
}

export function clearLastActivity(userId: string): void {
  try {
    getStorage()?.removeItem(`${STORAGE_PREFIX}:${userId}`);
  } catch {
    // idem
  }
}

export function resolveSessionActivity(
  lastActivity: number | null,
  now = Date.now(),
  limit = SESSION_INACTIVITY_LIMIT_MS,
): { timedOut: false; activity: number } | { timedOut: true } {
  if (lastActivity === null) return { timedOut: false, activity: now };
  if (lastActivity > now || now - lastActivity >= limit) return { timedOut: true };
  return { timedOut: false, activity: lastActivity };
}
