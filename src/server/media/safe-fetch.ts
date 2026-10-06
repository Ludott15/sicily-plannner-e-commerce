import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { FetchErrorCode } from "@/lib/media-admin";

// Fetch verso host esterni per l'importatore Commons (percorso sensibile):
// - solo https, porta 443, niente credenziali nell'URL;
// - host in una allowlist esatta, controllata anche a ogni redirect (seguiti a mano, al
//   massimo maxRedirects); un redirect fuori allowlist interrompe tutto;
// - nessun indirizzo interno: il lookup DNS della connessione rifiuta loopback, reti private,
//   link-local, metadati cloud e simili, quindi anche un DNS che cambia risposta tra un
//   controllo e la connessione (rebinding) non passa;
// - timeout complessivo, dimensione massima (Content-Length e conteggio dei byte letti),
//   Content-Type verificato.

export type SafeFetchErrorCode = FetchErrorCode;

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SafeFetchError";
  }
}

export type TransportResponse = {
  status: number;
  header: (name: string) => string | null;
  body: AsyncIterable<Uint8Array>;
  cancel: () => void;
};

// Esegue una singola richiesta GET senza seguire redirect. Sostituibile nei test.
export type Transport = (url: URL, signal: AbortSignal, headers?: Record<string, string>) => Promise<TransportResponse>;

export type SafeFetchOptions = {
  allowedHosts: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  contentTypes: readonly string[];
  headers?: Record<string, string>;
  transport?: Transport;
};

export type SafeFetchResult = { body: Buffer; contentType: string; finalUrl: string };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Controlla un URL prima di ogni richiesta (anche dopo un redirect).
export function checkUrl(raw: string | URL, allowedHosts: readonly string[], base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new SafeFetchError("invalid_url");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("invalid_url", "solo https");
  if (url.username || url.password) throw new SafeFetchError("invalid_url", "credenziali nell'URL");
  if (url.port !== "" && url.port !== "443") throw new SafeFetchError("invalid_url", "porta non standard");
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0 || !allowedHosts.includes(host)) {
    throw new SafeFetchError("host_not_allowed", host);
  }
  return url;
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const { allowedHosts, maxBytes, timeoutMs, maxRedirects = 3, contentTypes, headers, transport = nodeTransport } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  // Il timeout vale anche per un trasporto o un corpo che non ascoltano il segnale.
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new SafeFetchError("timeout")), { once: true });
  });
  timedOut.catch(() => {});
  let url = checkUrl(raw, allowedHosts);

  try {
    for (let hop = 0; ; hop++) {
      const res = await Promise.race([transport(url, signal, headers), timedOut]);
      if (REDIRECTS.has(res.status)) {
        res.cancel();
        if (hop >= maxRedirects) throw new SafeFetchError("too_many_redirects");
        const location = res.header("location");
        if (!location) throw new SafeFetchError("bad_status", "redirect senza Location");
        try {
          url = checkUrl(location, allowedHosts, url);
        } catch (error) {
          if (error instanceof SafeFetchError) throw new SafeFetchError("redirect_not_allowed", error.message);
          throw error;
        }
        continue;
      }
      if (res.status !== 200) {
        res.cancel();
        throw new SafeFetchError("bad_status", String(res.status));
      }
      const contentType = (res.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!contentTypes.includes(contentType)) {
        res.cancel();
        throw new SafeFetchError("bad_content_type", contentType || "assente");
      }
      const declared = Number(res.header("content-length") ?? "NaN");
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.cancel();
        throw new SafeFetchError("too_large", String(declared));
      }
      const chunks: Buffer[] = [];
      let total = 0;
      const reader = res.body[Symbol.asyncIterator]();
      for (;;) {
        const next = await Promise.race([reader.next(), timedOut]).catch((error) => {
          res.cancel();
          throw error;
        });
        if (next.done) break;
        const chunk = next.value;
        total += chunk.byteLength;
        if (total > maxBytes) {
          res.cancel();
          throw new SafeFetchError("too_large", `oltre ${maxBytes} byte`);
        }
        chunks.push(Buffer.from(chunk));
      }
      return { body: Buffer.concat(chunks), contentType, finalUrl: url.toString() };
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    if (signal.aborted) throw new SafeFetchError("timeout");
    if ((error as { code?: string })?.code === "private_address") throw new SafeFetchError("private_address");
    throw new SafeFetchError("network", (error as Error)?.message);
  }
}

// ---------------------------------------------------------------------------
// Indirizzi interni
// ---------------------------------------------------------------------------

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4 incapsulato (::ffff:10.0.0.1, ::10.0.0.1): conta l'indirizzo IPv4.
    const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

// Lookup DNS usato dalla connessione: risolve tutti gli indirizzi e rifiuta se anche uno solo
// è interno (un host pubblico non ha motivo di risolvere in rete privata).
export function makeSafeLookup(resolve: typeof dnsLookup = dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }]) as LookupAddress[];
      if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
        const error = Object.assign(new Error(`indirizzo interno per ${hostname}`), { code: "private_address" });
        return callback(error, "", 0);
      }
      if ((options as { all?: boolean }).all) return (callback as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

const safeLookup = makeSafeLookup();

const nodeTransport: Transport = (url, signal, headers) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        signal,
        headers: { "user-agent": "IsulaCatalogImporter/1.0", accept: "*/*", ...headers },
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          header: (name) => {
            const value = res.headers[name.toLowerCase()];
            return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
          },
          body: res,
          cancel: () => res.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
