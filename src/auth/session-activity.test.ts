import { describe, expect, it } from "vitest";
import { resolveSessionActivity, SESSION_INACTIVITY_LIMIT_MS } from "./session-activity";

describe("inatividade da sessão", () => {
  const now = 1_000_000_000;
  it("sem registro cria nova referência em vez de derrubar a sessão", () => {
    expect(resolveSessionActivity(null, now)).toEqual({ timedOut: false, activity: now });
  });
  it("expira após o limite e com relógio no futuro", () => {
    expect(resolveSessionActivity(now - SESSION_INACTIVITY_LIMIT_MS, now)).toEqual({ timedOut: true });
    expect(resolveSessionActivity(now + 1, now)).toEqual({ timedOut: true });
    expect(resolveSessionActivity(now - 1000, now)).toEqual({ timedOut: false, activity: now - 1000 });
  });
});
