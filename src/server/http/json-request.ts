import "server-only";
import { checkUrl } from "@/server/media/safe-fetch";

// Richiesta JSON verso API di partner ed embedding: solo https, host in allowlist esatta,
// nessun redirect seguito, timeout, dimensione massima letta a pezzi (come
// src/server/flights/client.ts). Il corpo di errore del fornitore non si espone mai.

export type JsonRequestErrorCode =
  | "invalid_url"
  | "host_not_allowed"
  | "timeout"
  | "network"
  | "bad_status"
  | "bad_content_type"
  | "too_large"
  | "bad_json";

export class JsonRequestError extends Error {
  constructor(
    readonly code: JsonRequestErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "JsonRequestError";
  }
}

export type JsonRequest = {
  url: string;
  method: "GET" | "POST";
  allowedHosts: readonly string[];
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  maxBytes: number;
  fetchImpl?: typeof fetch;
};

export async function requestJson(request: JsonRequest): Promise<unknown> {
  let url: URL;
  try {
    url = checkUrl(request.url, request.allowedHosts);
  } catch (error) {
    const code = (error as { code?: string }).code === "host_not_allowed" ? "host_not_allowed" : "invalid_url";
    throw new JsonRequestError(code);
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const hasBody = request.body !== undefined;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: request.method,
      headers: {
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...request.headers,
      },
      body: hasBody ? JSON.stringify(request.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(request.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new JsonRequestError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }

  if (!response.ok) throw new JsonRequestError("bad_status", String(response.status));
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) throw new JsonRequestError("bad_content_type");
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > request.maxBytes) throw new JsonRequestError("too_large");

  let text: string | null;
  try {
    text = await readCapped(response, request.maxBytes);
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new JsonRequestError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (text === null) throw new JsonRequestError("too_large");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JsonRequestError("bad_json");
  }
}

// Legge fermandosi appena supera maxBytes: null se il corpo è troppo grande.
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
