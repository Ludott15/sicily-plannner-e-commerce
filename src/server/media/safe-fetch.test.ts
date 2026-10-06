import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { SafeFetchError, checkUrl, isPublicAddress, makeSafeLookup, safeFetch, type Transport } from "./safe-fetch";

type Reply = { status: number; headers?: Record<string, string>; body?: Uint8Array[] | (() => AsyncIterable<Uint8Array>) };

// Trasporto finto: risponde per URL e registra le richieste fatte.
function fakeTransport(replies: Record<string, Reply>) {
  const requested: string[] = [];
  const transport: Transport = async (url, signal) => {
    requested.push(url.toString());
    const reply = replies[url.toString()];
    if (!reply) throw new Error(`richiesta inattesa: ${url}`);
    return {
      status: reply.status,
      header: (name) => reply.headers?.[name.toLowerCase()] ?? null,
      body:
        typeof reply.body === "function"
          ? reply.body()
          : (async function* () {
              for (const chunk of (reply.body as Uint8Array[] | undefined) ?? []) {
                if (signal.aborted) throw signal.reason;
                yield chunk;
              }
            })(),
      cancel: () => {},
    };
  };
  return { transport, requested };
}

const ALLOWED = ["upload.wikimedia.org"];
const base = { allowedHosts: ALLOWED, maxBytes: 1000, timeoutMs: 1000, contentTypes: ["image/jpeg"] };
const ok = (bytes = 10): Reply => ({ status: 200, headers: { "content-type": "image/jpeg" }, body: [new Uint8Array(bytes)] });

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SafeFetchError);
    return (error as SafeFetchError).code;
  }
  throw new Error("nessun errore");
}

describe("checkUrl", () => {
  it("accetta solo https verso host in allowlist, porta standard, senza credenziali", () => {
    expect(checkUrl("https://upload.wikimedia.org/a.jpg", ALLOWED).hostname).toBe("upload.wikimedia.org");
    expect(() => checkUrl("http://upload.wikimedia.org/a.jpg", ALLOWED)).toThrow("invalid_url");
    expect(() => checkUrl("https://upload.wikimedia.org:8443/a.jpg", ALLOWED)).toThrow("invalid_url");
    expect(() => checkUrl("https://user:pw@upload.wikimedia.org/a.jpg", ALLOWED)).toThrow("invalid_url");
    expect(() => checkUrl("https://esempio.it/a.jpg", ALLOWED)).toThrow("host_not_allowed");
    expect(() => checkUrl("https://upload.wikimedia.org.esempio.it/a.jpg", ALLOWED)).toThrow("host_not_allowed");
    expect(() => checkUrl("https://evil-upload.wikimedia.org/a.jpg", ALLOWED)).toThrow("host_not_allowed");
    expect(() => checkUrl("https://127.0.0.1/a.jpg", ALLOWED)).toThrow("host_not_allowed");
    expect(() => checkUrl("https://[::1]/a.jpg", ALLOWED)).toThrow("host_not_allowed");
    expect(() => checkUrl("file:///etc/passwd", ALLOWED)).toThrow("invalid_url");
    expect(() => checkUrl("non un url", ALLOWED)).toThrow("invalid_url");
  });
});

describe("safeFetch", () => {
  it("scarica un file consentito", async () => {
    const { transport } = fakeTransport({ "https://upload.wikimedia.org/a.jpg": ok(10) });
    const res = await safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport });
    expect(res.body.byteLength).toBe(10);
    expect(res.contentType).toBe("image/jpeg");
  });

  it("URL fuori allowlist: nessuna richiesta", async () => {
    const { transport, requested } = fakeTransport({});
    expect(await errorCode(safeFetch("https://esempio.it/a.jpg", { ...base, transport }))).toBe("host_not_allowed");
    expect(requested).toEqual([]);
  });

  it("redirect dentro l'allowlist seguito, fuori allowlist interrotto senza richiesta", async () => {
    const { transport, requested } = fakeTransport({
      "https://upload.wikimedia.org/a.jpg": { status: 302, headers: { location: "/b.jpg" } },
      "https://upload.wikimedia.org/b.jpg": { status: 301, headers: { location: "https://169.254.169.254/latest/meta-data" } },
    });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport }))).toBe("redirect_not_allowed");
    expect(requested).toEqual(["https://upload.wikimedia.org/a.jpg", "https://upload.wikimedia.org/b.jpg"]);

    const http = fakeTransport({ "https://upload.wikimedia.org/a.jpg": { status: 307, headers: { location: "http://upload.wikimedia.org/a.jpg" } } });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport: http.transport }))).toBe(
      "redirect_not_allowed",
    );
  });

  it("troppi redirect", async () => {
    const { transport } = fakeTransport({
      "https://upload.wikimedia.org/a.jpg": { status: 302, headers: { location: "/a.jpg" } },
    });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport, maxRedirects: 2 }))).toBe(
      "too_many_redirects",
    );
  });

  it("dimensione eccessiva: dichiarata o letta in streaming", async () => {
    const declared = fakeTransport({
      "https://upload.wikimedia.org/a.jpg": { status: 200, headers: { "content-type": "image/jpeg", "content-length": "5000" }, body: [] },
    });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport: declared.transport }))).toBe("too_large");

    const streamed = fakeTransport({
      "https://upload.wikimedia.org/a.jpg": {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: [new Uint8Array(600), new Uint8Array(600)],
      },
    });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport: streamed.transport }))).toBe("too_large");
  });

  it("tipo non ammesso e stato diverso da 200", async () => {
    const html = fakeTransport({ "https://upload.wikimedia.org/a.jpg": { status: 200, headers: { "content-type": "text/html" }, body: [] } });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport: html.transport }))).toBe("bad_content_type");
    const missing = fakeTransport({ "https://upload.wikimedia.org/a.jpg": { status: 404 } });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport: missing.transport }))).toBe("bad_status");
  });

  it("timeout", async () => {
    const { transport } = fakeTransport({
      "https://upload.wikimedia.org/a.jpg": {
        status: 200,
        headers: { "content-type": "image/jpeg" },
        body: async function* () {
          await new Promise((resolve) => setTimeout(resolve, 200));
          yield new Uint8Array(1);
        },
      },
    });
    expect(await errorCode(safeFetch("https://upload.wikimedia.org/a.jpg", { ...base, transport, timeoutMs: 50 }))).toBe("timeout");
  });
});

describe("indirizzi interni", () => {
  it("riconosce loopback, reti private, link-local e metadati cloud", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a00:1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["198.35.26.112", "208.80.154.240", "2620:0:862:ed1a::2:b"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("il lookup della connessione rifiuta un host che risolve anche in un indirizzo interno", async () => {
    const resolver = (addresses: LookupAddress[]) =>
      ((_host: string, _opts: unknown, cb: (err: Error | null, addresses: LookupAddress[]) => void) => cb(null, addresses)) as never;
    const run = (addresses: LookupAddress[]) =>
      new Promise<{ err: (Error & { code?: string }) | null; address: unknown }>((resolve) =>
        makeSafeLookup(resolver(addresses))("upload.wikimedia.org", {}, (err, address) => resolve({ err, address })),
      );

    expect((await run([{ address: "198.35.26.112", family: 4 }])).address).toBe("198.35.26.112");
    const rebinding = await run([
      { address: "198.35.26.112", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    expect(rebinding.err?.code).toBe("private_address");
    expect((await run([{ address: "127.0.0.1", family: 4 }])).err?.code).toBe("private_address");
  });
});
