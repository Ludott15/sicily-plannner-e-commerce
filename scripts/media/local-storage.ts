// Scrittura nello storage del Supabase LOCALE per l'importazione delle foto scelte (solo script CLI).
// L'app non usa mai questo file: nell'app le foto passano dalla sessione dell'admin.
// Chiave e URL si leggono da `supabase status`, e si usano solo se DATABASE_URL e l'API sono in locale.

import { execSync } from "node:child_process";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Stesso controllo di isLocalDatabase in scripts/content/import-guides.mjs.
export function isLocalDatabase(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export type LocalSupabase = { apiUrl: string; secretKey: string };

// Legge API_URL e SECRET_KEY dall'output di `supabase status -o env` (righe KEY="valore").
export function parseSupabaseStatusEnv(text: string): LocalSupabase {
  const value = (name: string) => text.match(new RegExp(`^${name}="?([^"\n]+)"?$`, "m"))?.[1]?.trim() ?? "";
  const apiUrl = value("API_URL");
  const secretKey = value("SECRET_KEY");
  if (!apiUrl || !secretKey) throw new Error("supabase status non riporta API_URL o SECRET_KEY: il Supabase locale è avviato?");
  return { apiUrl, secretKey };
}

export function readLocalSupabase(root: string): LocalSupabase {
  const text = execSync("npx supabase status -o env", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return parseSupabaseStatusEnv(text);
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string | Uint8Array }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Writer dello storage con la chiave secret locale, con la stessa forma di StorageWriter (storage.admin.ts).
export function localStorageWriter(apiUrl: string, secretKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike) {
  const auth = { apikey: secretKey, authorization: `Bearer ${secretKey}` };
  return {
    async upload(path: string, body: Uint8Array, contentType: string): Promise<void> {
      const res = await fetchImpl(`${apiUrl}/storage/v1/object/media/${path}`, {
        method: "POST",
        headers: { ...auth, "content-type": contentType, "x-upsert": "true" },
        body,
      });
      if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
    },
    async remove(paths: string[]): Promise<void> {
      if (paths.length === 0) return;
      const res = await fetchImpl(`${apiUrl}/storage/v1/object/media`, {
        method: "DELETE",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw new Error(`remove: ${res.status} ${await res.text()}`);
    },
  };
}
