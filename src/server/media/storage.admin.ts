import "server-only";
import { createClient } from "@/server/supabase/server";

// Accesso dell'admin al bucket "media": usa la sessione dell'admin (cookie verificati dallo
// storage), quindi a ogni chiamata si applicano le policy su storage.objects, che consentono
// scrittura e lettura completa solo a public.is_admin(). È la seconda difesa dopo
// requireAdmin nelle azioni. Nessuna chiave di servizio.
// Il client Supabase qui serve solo per lo storage (file), non per i dati: i dati passano
// da Drizzle.

export const BUCKET = "media";

async function bucket() {
  const supabase = await createClient();
  return supabase.storage.from(BUCKET);
}

export class StorageError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`storage ${operation}: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "StorageError";
  }
}

export async function uploadObject(path: string, body: Buffer, contentType: string) {
  const { error } = await (await bucket()).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new StorageError("upload", error);
}

export async function downloadObject(path: string): Promise<Buffer> {
  const { data, error } = await (await bucket()).download(path);
  if (error || !data) throw new StorageError("download", error);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await (await bucket()).remove(paths);
  if (error) throw new StorageError("remove", error);
}

// Nomi dei file sotto un prefisso (una cartella, non ricorsivo).
export async function listObjects(prefix: string): Promise<string[]> {
  const { data, error } = await (await bucket()).list(prefix, { limit: 1000 });
  if (error) throw new StorageError("list", error);
  return (data ?? []).filter((o) => o.id !== null).map((o) => `${prefix}/${o.name}`);
}

// URL firmato per caricare un file direttamente dal browser in incoming/ (il corpo non passa
// dalla funzione serverless, che su Vercel accetta al massimo 4,5 MB). Lo crea la sessione
// dell'admin, quindi anche qui decide la policy di insert.
export async function createUploadUrl(path: string) {
  const { data, error } = await (await bucket()).createSignedUploadUrl(path);
  if (error || !data) throw new StorageError("signed upload", error);
  return data.signedUrl;
}
