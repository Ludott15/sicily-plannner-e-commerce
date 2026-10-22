import { describe, expect, it } from "vitest";
import {
  isPrefetchRequest,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  createNonce,
  originOf,
  sentryIngestOrigin,
  type SecurityHeaderOptions,
} from "./headers";

const SUPABASE = "https://abcdefgh.supabase.co";
const base: SecurityHeaderOptions = {
  nonce: "bm9uY2UtdGVzdA==",
  isDev: false,
  isProduction: false,
  supabaseUrl: SUPABASE,
};

// Direttive della CSP come mappa nome -> valori (la CSP è una lista separata da "; ").
function parseCsp(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name ?? "", values] as const;
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  it("usa il nonce della richiesta per script e stili, mai 'unsafe-inline' sugli script", () => {
    const csp = parseCsp(buildContentSecurityPolicy(base));
    expect(csp.get("script-src")).toEqual(["'self'", "'nonce-bm9uY2UtdGVzdA=='", "'strict-dynamic'", "https://challenges.cloudflare.com"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'nonce-bm9uY2UtdGVzdA=='"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("permette lo stile inline degli attributi style di React senza nonce", () => {
    const csp = parseCsp(buildContentSecurityPolicy(base));
    expect(csp.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("apre solo le origini che il sito usa: Supabase http e realtime wss, tile della mappa, Turnstile", () => {
    const csp = parseCsp(buildContentSecurityPolicy(base));
    expect(csp.get("connect-src")).toEqual([
      "'self'",
      "https://challenges.cloudflare.com",
      "https://tiles.openfreemap.org",
      SUPABASE,
      "wss://abcdefgh.supabase.co",
    ]);
    expect(csp.get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
    expect(csp.get("img-src")).toEqual(["'self'", "blob:", "data:", "https://lh3.googleusercontent.com", SUPABASE]);
    expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  it("chiude il sito agli iframe e agli oggetti", () => {
    const csp = parseCsp(buildContentSecurityPolicy(base));
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
  });

  it("in sviluppo aggiunge 'unsafe-eval' e le connessioni HMR, senza upgrade-insecure-requests", () => {
    const csp = parseCsp(buildContentSecurityPolicy({ ...base, isDev: true }));
    expect(csp.get("script-src")).toContain("'unsafe-eval'");
    expect(csp.get("connect-src")).toEqual(expect.arrayContaining(["ws:", "wss:"]));
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("in sviluppo ammette i <style> degli strumenti di Next, in produzione no", () => {
    expect(parseCsp(buildContentSecurityPolicy({ ...base, isDev: true })).get("style-src-elem")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
    expect(parseCsp(buildContentSecurityPolicy(base)).has("style-src-elem")).toBe(false);
  });

  it("in produzione promuove le richieste a https e non apre websocket generici", () => {
    const csp = parseCsp(buildContentSecurityPolicy({ ...base, isProduction: true }));
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
    expect(csp.get("connect-src")).not.toContain("ws:");
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("aggiunge l'host di ingest di Sentry solo se il DSN è configurato", () => {
    const without = parseCsp(buildContentSecurityPolicy(base)).get("connect-src") ?? [];
    expect(without.some((origin) => origin.includes("sentry"))).toBe(false);
    const withDsn = parseCsp(
      buildContentSecurityPolicy({ ...base, sentryDsn: "https://publickey@o123.ingest.sentry.io/456" }),
    ).get("connect-src");
    expect(withDsn).toContain("https://o123.ingest.sentry.io");
  });

  it("non contiene caratteri che spezzano la direttiva", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).not.toMatch(/\n|\r/);
    expect(csp.startsWith("default-src 'self'; script-src ")).toBe(true);
  });
});

describe("buildSecurityHeaders", () => {
  it("in sviluppo non mette HSTS, mentre in produzione sì", () => {
    expect(buildSecurityHeaders(base)).not.toHaveProperty("Strict-Transport-Security");
    expect(buildSecurityHeaders({ ...base, isProduction: true })["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("imposta nosniff, Referrer-Policy, frame DENY e Permissions-Policy con la geolocalizzazione solo per il sito", () => {
    const headers = buildSecurityHeaders(base);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("payment=()");
  });

  it("include la CSP con lo stesso nonce", () => {
    expect(buildSecurityHeaders(base)["Content-Security-Policy"]).toBe(buildContentSecurityPolicy(base));
  });
});

describe("originOf e sentryIngestOrigin", () => {
  it("prende solo scheme e host", () => {
    expect(originOf("https://abc.supabase.co/rest/v1?x=1")).toBe("https://abc.supabase.co");
    expect(originOf("non è un url")).toBeNull();
    expect(originOf(undefined)).toBeNull();
    expect(originOf("")).toBeNull();
  });

  it("ricava l'host di ingest dal DSN e ignora DSN vuoti", () => {
    expect(sentryIngestOrigin("https://key@o1.ingest.sentry.io/9")).toBe("https://o1.ingest.sentry.io");
    expect(sentryIngestOrigin("   ")).toBeNull();
    expect(sentryIngestOrigin(undefined)).toBeNull();
  });
});

describe("createNonce", () => {
  it("codifica in base64 e cambia a ogni chiamata con byte diversi", () => {
    const a = createNonce(new Uint8Array(16).fill(1));
    const b = createNonce(new Uint8Array(16).fill(2));
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});

describe("isPrefetchRequest", () => {
  it("riconosce il prefetch del router e la sua intestazione purpose", () => {
    expect(isPrefetchRequest(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ accept: "text/html" }))).toBe(false);
  });
});
