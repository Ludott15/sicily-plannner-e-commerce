import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";
import { activities, places } from "@/server/db/schema";
import { JsonRequestError } from "@/server/http/json-request";
import { contentHash, embeddingText, type EmbeddingSource } from "./hash";
import { EMBEDDING_BATCH, embedDocuments } from "./voyage";

// Cron embed-activities: calcola l'embedding delle attività attive o da verificare il cui
// contenuto è nuovo o cambiato (hash in activities.embedded_hash). Senza chiave non fa nulla.

export const EMBEDDING_LIMIT_PER_RUN = 512;
const PROVIDER = "voyage";

export type EmbedOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
};

export type EmbedOutcome =
  | { status: "skipped"; reason: "provider" | "unconfigured" }
  | { status: "ok"; embedded: number; pending: number }
  | { status: "failed"; embedded: number; error: string };

type Candidate = { id: string; text: string; hash: string };

export async function runActivityEmbeddings(options: EmbedOptions = {}): Promise<EmbedOutcome> {
  const env = options.env ?? process.env;
  const provider = (env.EMBEDDINGS_PROVIDER ?? "").trim() || PROVIDER;
  if (provider !== PROVIDER) return { status: "skipped", reason: "provider" };
  const apiKey = (env.VOYAGE_API_KEY ?? "").trim();
  if (apiKey === "") return { status: "skipped", reason: "unconfigured" };

  const candidates = await loadCandidates();
  const batch = candidates.slice(0, EMBEDDING_LIMIT_PER_RUN);
  let embedded = 0;
  try {
    for (let start = 0; start < batch.length; start += EMBEDDING_BATCH) {
      const chunk = batch.slice(start, start + EMBEDDING_BATCH);
      const vectors = await embedDocuments(
        chunk.map((item) => item.text),
        { apiKey, fetchImpl: options.fetchImpl },
      );
      await saveVectors(chunk, vectors);
      embedded += chunk.length;
    }
  } catch (error) {
    const code = error instanceof JsonRequestError ? error.code : "unknown";
    console.error("embed-activities: batch non riuscito", code);
    return { status: "failed", embedded, error: code };
  }
  return { status: "ok", embedded, pending: candidates.length - embedded };
}

// Una sola query: attività attive o da verificare con luogo; si confronta l'hash in codice.
async function loadCandidates(): Promise<Candidate[]> {
  const rows = await dbAdmin
    .select({
      id: activities.id,
      title: activities.title,
      description: activities.description,
      placeName: places.name,
      lat: places.lat,
      lng: places.lng,
      embeddedHash: activities.embeddedHash,
      hasEmbedding: sql<boolean>`${activities.embedding} is not null`,
    })
    .from(activities)
    .innerJoin(places, eq(places.id, activities.placeId))
    .where(or(eq(activities.isActive, true), eq(activities.needsReview, true)));

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const source: EmbeddingSource = {
      title: row.title,
      description: row.description,
      placeName: row.placeName,
      lat: row.lat,
      lng: row.lng,
    };
    const hash = contentHash(source);
    if (row.hasEmbedding && row.embeddedHash === hash) continue;
    candidates.push({ id: row.id, text: embeddingText(source), hash });
  }
  return candidates;
}

// Scrittura di un blocco in una query: vettore e hash insieme, così non restano disallineati.
async function saveVectors(chunk: readonly Candidate[], vectors: readonly number[][]): Promise<void> {
  if (chunk.length !== vectors.length) throw new Error("embed: vettori non allineati");
  await dbAdmin.execute(sql`
    update activities as a
    set embedding = v.vec::vector, embedded_hash = v.hash
    from (values ${sql.join(
      chunk.map((item, i) => sql`(${item.id}::uuid, ${`[${(vectors[i] ?? []).join(",")}]`}, ${item.hash})`),
      sql`, `,
    )}) as v(id, vec, hash)
    where a.id = v.id
  `);
}
