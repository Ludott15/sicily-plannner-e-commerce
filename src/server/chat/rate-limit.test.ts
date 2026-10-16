import { describe, expect, it } from "vitest";
import { chatBucket, decideChatLimit, nextWindowStart, type HitCounter } from "./rate-limit";
import { CHAT_DAILY_LIMIT, CHAT_IP_LIMIT } from "./config";

const NOW = new Date("2026-10-16T10:30:00.000Z");
const user = { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7" };

// Contatore finto: risponde con la sequenza data e registra le chiamate.
function counter(answers: boolean[]) {
  const calls: { bucket: string; limit: number; window: number }[] = [];
  const fn: HitCounter = async (bucket, limit, window) => {
    calls.push({ bucket, limit, window });
    return answers[calls.length - 1] ?? false;
  };
  return { fn, calls };
}

describe("nextWindowStart", () => {
  it("restituisce l'inizio della finestra successiva", () => {
    expect(nextWindowStart(3600, NOW).toISOString()).toBe("2026-10-16T11:00:00.000Z");
    expect(nextWindowStart(86400, NOW).toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });
});

describe("decideChatLimit", () => {
  it("consente con entrambi i contatori, bucket HMAC chat: e limiti dal config", async () => {
    const c = counter([true, true]);
    const decision = await decideChatLimit({ user, ip: "203.0.113.5", secret: "s", counter: c.fn, now: NOW });
    expect(decision).toEqual({ allowed: true });
    expect(c.calls[0]).toEqual({ bucket: chatBucket("user", user.id, "s"), limit: CHAT_DAILY_LIMIT.user, window: 86400 });
    expect(c.calls[1]?.limit).toBe(CHAT_IP_LIMIT.limit);
    expect(c.calls[1]?.bucket).not.toContain("203.0.113.5");
  });

  it("rifiuta con l'ora di ripristino quando il limite giornaliero è raggiunto", async () => {
    const c = counter([false]);
    const decision = await decideChatLimit({ user, ip: null, secret: "s", counter: c.fn, now: NOW });
    expect(decision).toEqual({ allowed: false, resetAt: "2026-10-17T00:00:00.000Z" });
    expect(c.calls).toHaveLength(1);
  });

  it("rifiuta con il reset orario quando scatta il limite per IP", async () => {
    const c = counter([true, false]);
    const decision = await decideChatLimit({ user, ip: "198.51.100.1", secret: "s", counter: c.fn, now: NOW });
    expect(decision).toEqual({ allowed: false, resetAt: "2026-10-16T11:00:00.000Z" });
  });

  it("fail closed: un errore del contatore è un rifiuto", async () => {
    const failing: HitCounter = async () => {
      throw new Error("db down");
    };
    const decision = await decideChatLimit({ user, ip: null, secret: "s", counter: failing, now: NOW });
    expect(decision.allowed).toBe(false);
  });

  it("i bucket cambiano con il segreto, lo scope e l'identità", () => {
    expect(chatBucket("user", user.id, "a")).not.toBe(chatBucket("user", user.id, "b"));
    expect(chatBucket("user", user.id, "a")).not.toBe(chatBucket("ip", user.id, "a"));
  });
});
