import { describe, expect, it } from "vitest";
import { REDACTED, redactString, scrubSentryEvent } from "./scrub";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLWJ5dGVz";

describe("redactString", () => {
  it("sostituisce gli indirizzi email", () => {
    expect(redactString("utente mario.rossi@example.com non trovato")).toBe(`utente ${REDACTED} non trovato`);
  });

  it("sostituisce i token JWT", () => {
    expect(redactString(`header ${JWT} fine`)).toBe(`header ${REDACTED} fine`);
  });

  it("toglie i valori dei parametri di codice e token", () => {
    expect(redactString("/auth/callback?code=abc123&next=/it")).toBe("/auth/callback");
    expect(redactString("https://x.test/cb?access_token=zzz")).toBe("https://x.test/cb");
    expect(redactString("errore code=123456")).toBe(`errore code=${REDACTED}`);
  });

  it("toglie query string e fragment dagli URL", () => {
    expect(redactString("https://isula.test/it/cerca?q=vulcano#top")).toBe("https://isula.test/it/cerca");
    expect(redactString("GET /it/cerca?q=vulcano")).toBe("GET /it/cerca");
  });

  it("lascia intatto il testo senza dati sensibili", () => {
    expect(redactString("Error: connection refused")).toBe("Error: connection refused");
  });
});

describe("scrubSentryEvent", () => {
  it("toglie cookie, autorizzazione, corpo e query string della richiesta", () => {
    const event = {
      request: {
        url: "https://isula.test/api/go/abc?code=1",
        query_string: "code=1",
        data: { email: "a@example.com", password: "x" },
        cookies: { "sb-token": "secret" },
        headers: {
          cookie: "sb-access-token=abc",
          authorization: "Bearer xyz",
          "user-agent": "Mozilla/5.0",
        },
      },
    };
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request).toEqual({
      url: "https://isula.test/api/go/abc",
      headers: { "user-agent": "Mozilla/5.0" },
    });
  });

  it("toglie l'utente per intero (id, email, IP)", () => {
    const scrubbed = scrubSentryEvent({
      message: "boom",
      user: { id: "00000000-0000-4000-8000-000000000000", email: "a@example.com", ip_address: "1.2.3.4" },
    });
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed.message).toBe("boom");
  });

  it("ripulisce le stringhe annidate (eccezioni, breadcrumb, extra)", () => {
    const scrubbed = scrubSentryEvent({
      exception: { values: [{ value: `token ${JWT} per mario@example.com` }] },
      breadcrumbs: [{ message: "GET /api/go/x?token=abc", category: "fetch" }],
      extra: { lista: ["ok", "scrivi a g@example.org"] },
    });
    const text = JSON.stringify(scrubbed);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("example.org");
    expect(text).not.toContain(JWT);
    expect(text).not.toContain("token=abc");
    expect(scrubbed.breadcrumbs[0]).toEqual({ message: "GET /api/go/x", category: "fetch" });
  });

  it("non modifica l'evento originale", () => {
    const event = { user: { email: "a@example.com" }, message: "mario@example.com" };
    const copy = JSON.parse(JSON.stringify(event)) as typeof event;
    scrubSentryEvent(event);
    expect(event).toEqual(copy);
  });

  it("conserva i campi tecnici utili alla diagnosi", () => {
    const scrubbed = scrubSentryEvent({
      release: "abc123",
      environment: "production",
      tags: { route: "/api/go/[id]" },
    });
    expect(scrubbed).toEqual({ release: "abc123", environment: "production", tags: { route: "/api/go/[id]" } });
  });
});
