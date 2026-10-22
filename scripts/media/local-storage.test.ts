import { describe, expect, it } from "vitest";
import { isLocalDatabase, localStorageWriter, parseSupabaseStatusEnv, type FetchLike } from "./local-storage";

describe("isLocalDatabase", () => {
  it("accetta solo host locali", () => {
    expect(isLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@db.abcdef.supabase.co:5432/postgres")).toBe(false);
    expect(isLocalDatabase("non è un url")).toBe(false);
  });
});

describe("parseSupabaseStatusEnv", () => {
  it("legge API_URL e SECRET_KEY, e rifiuta l'output incompleto", () => {
    const text = 'API_URL="http://127.0.0.1:55321"\nSECRET_KEY="sb_secret_test"\nANON_KEY="eyJ"\n';
    expect(parseSupabaseStatusEnv(text)).toEqual({ apiUrl: "http://127.0.0.1:55321", secretKey: "sb_secret_test" });
    expect(() => parseSupabaseStatusEnv('API_URL="http://127.0.0.1:55321"\n')).toThrow();
  });
});

describe("localStorageWriter", () => {
  it("carica nel bucket media con chiave e upsert, e rimuove per prefisso", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body?: string | Uint8Array }[] = [];
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, ...init });
      return { ok: true, status: 200, text: async () => "" };
    };
    const writer = localStorageWriter("http://127.0.0.1:55321", "sb_secret_test", fake);
    await writer.upload("id/master.jpg", new Uint8Array([1, 2]), "image/jpeg");
    await writer.remove(["id/master.jpg"]);
    expect(calls[0]).toMatchObject({ url: "http://127.0.0.1:55321/storage/v1/object/media/id/master.jpg", method: "POST" });
    expect(calls[0]?.headers).toMatchObject({ apikey: "sb_secret_test", "x-upsert": "true", "content-type": "image/jpeg" });
    expect(calls[1]).toMatchObject({ url: "http://127.0.0.1:55321/storage/v1/object/media", method: "DELETE", body: JSON.stringify({ prefixes: ["id/master.jpg"] }) });
  });

  it("errore dello storage: il messaggio riporta il codice", async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 403, text: async () => "denied" });
    await expect(localStorageWriter("http://127.0.0.1:55321", "k", fake).upload("a", new Uint8Array(), "image/jpeg")).rejects.toThrow("403");
  });
});
