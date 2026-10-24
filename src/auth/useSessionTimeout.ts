import { useEffect } from "react";
import { readLastActivity, resolveSessionActivity, writeLastActivity } from "./session-activity";

const EVENTOS = ["pointerdown", "keydown", "scroll"] as const;

/** Encerra a sessão após inatividade (padrão do SessionTimeout do Neuro Hub Pro). */
export function useSessionTimeout(userId: string | undefined, onTimeout: () => void) {
  useEffect(() => {
    if (!userId) return;
    const inicial = resolveSessionActivity(readLastActivity(userId));
    if (inicial.timedOut) {
      onTimeout();
      return;
    }
    writeLastActivity(userId, inicial.activity);
    let ultimaGravacao = 0;
    const registrar = () => {
      const agora = Date.now();
      if (agora - ultimaGravacao > 15_000) {
        ultimaGravacao = agora;
        writeLastActivity(userId, agora);
      }
    };
    const verificar = window.setInterval(() => {
      if (resolveSessionActivity(readLastActivity(userId)).timedOut) onTimeout();
    }, 60_000);
    EVENTOS.forEach((evento) => window.addEventListener(evento, registrar, { passive: true }));
    return () => {
      window.clearInterval(verificar);
      EVENTOS.forEach((evento) => window.removeEventListener(evento, registrar));
    };
  }, [userId, onTimeout]);
}
