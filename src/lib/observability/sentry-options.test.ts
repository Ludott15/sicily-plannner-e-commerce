import { describe, expect, it } from "vitest";
import { sentryDsn, sentryRelease, scrubBeforeSend, SENTRY_COMMON_OPTIONS } from "./sentry-options";

describe("sentryDsn", () => {
  it("non c'è DSN se le variabili mancano o sono vuote (nessun SDK parte)", () => {
    expect(sentryDsn({})).toBeUndefined();
    expect(sentryDsn({ SENTRY_DSN: "   ", NEXT_PUBLIC_SENTRY_DSN: "" })).toBeUndefined();
  });

  it("accetta il DSN pubblico o quello di solo server, senza spazi", () => {
    expect(sentryDsn({ NEXT_PUBLIC_SENTRY_DSN: " https://k@o1.ingest.sentry.io/2 " })).toBe(
      "https://k@o1.ingest.sentry.io/2",
    );
    expect(sentryDsn({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/3" })).toBe("https://k@o1.ingest.sentry.io/3");
  });
});

describe("sentryRelease", () => {
  it("usa il commit del deploy, sul server e nel browser", () => {
    expect(sentryRelease({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe("abc123");
    expect(sentryRelease({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "def456" })).toBe("def456");
    expect(sentryRelease({})).toBeUndefined();
  });
});

describe("scrubBeforeSend e opzioni comuni", () => {
  it("applica la pulizia all'evento", () => {
    const event = { message: "errore per a@example.com", user: { id: "u" } };
    expect(scrubBeforeSend(event)).toEqual({ message: "errore per [redatto]" });
  });

  it("non invia IP, non traccia le prestazioni e non registra sessioni", () => {
    expect(SENTRY_COMMON_OPTIONS.sendDefaultPii).toBe(false);
    expect(SENTRY_COMMON_OPTIONS.tracesSampleRate).toBe(0);
    expect(SENTRY_COMMON_OPTIONS.replaysSessionSampleRate).toBe(0);
    expect(SENTRY_COMMON_OPTIONS.replaysOnErrorSampleRate).toBe(0);
  });
});
