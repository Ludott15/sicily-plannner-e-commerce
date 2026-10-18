import { z } from "zod";
import { requestJson } from "@/server/http/json-request";

// Embedding con Voyage AI (POST /v1/embeddings). Modello e dimensioni fissi: la colonna
// activities.embedding è vector(1024). Errori: JsonRequestError, classificati dal chiamante.

export const VOYAGE_HOST = "api.voyageai.com";
export const VOYAGE_URL = `https://${VOYAGE_HOST}/v1/embeddings`;
export const VOYAGE_MODEL = "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_BATCH = 64;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

const responseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()),
    }),
  ),
});

// Un vettore per testo, nell'ordine dell'input. Errore se il numero, l'indice o la dimensione non tornano.
export async function embedDocuments(
  texts: readonly string[],
  options: { apiKey: string; fetchImpl?: typeof fetch },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const body = await requestJson({
    url: VOYAGE_URL,
    method: "POST",
    allowedHosts: [VOYAGE_HOST],
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: { input: texts, model: VOYAGE_MODEL, input_type: "document" },
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    fetchImpl: options.fetchImpl,
  });
  return parseEmbeddings(body, texts.length);
}

export function parseEmbeddings(body: unknown, expected: number): number[][] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new Error("voyage: risposta non valida");
  const vectors: (number[] | undefined)[] = new Array<number[] | undefined>(expected).fill(undefined);
  for (const item of parsed.data.data) {
    if (item.index >= expected || vectors[item.index] !== undefined) throw new Error("voyage: indice non valido");
    if (item.embedding.length !== EMBEDDING_DIMENSIONS || !item.embedding.every(Number.isFinite)) {
      throw new Error("voyage: dimensione non valida");
    }
    vectors[item.index] = item.embedding;
  }
  const ordered: number[][] = [];
  for (const vector of vectors) {
    if (vector === undefined) throw new Error("voyage: embedding mancante");
    ordered.push(vector);
  }
  return ordered;
}
