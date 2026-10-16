import { describe, expect, it } from "vitest";
import { contentHash, embeddingText, type EmbeddingSource } from "./hash";
import { EMBEDDING_DIMENSIONS, embedDocuments, parseEmbeddings, VOYAGE_URL } from "./voyage";

const source: EmbeddingSource = {
  title: "Escursione all'Etna",
  description: "Salita in jeep.",
  placeName: "Catania",
  lat: 37.751,
  lng: 14.9934,
};

describe("contentHash", () => {
  it("è stabile e cambia con il contenuto", () => {
    expect(contentHash(source)).toBe(contentHash({ ...source }));
    expect(contentHash({ ...source, description: "Salita a piedi." })).not.toBe(contentHash(source));
    expect(contentHash({ ...source, description: null })).not.toBe(contentHash(source));
    expect(contentHash({ ...source, lat: 37.8 })).not.toBe(contentHash(source));
  });

  it("il testo per il modello contiene titolo, descrizione e luogo", () => {
    expect(embeddingText(source).split("\n")[0]).toBe("Escursione all'Etna");
    expect(embeddingText(source)).toContain("Catania");
  });
});

const vector = (value: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => value);

describe("parseEmbeddings", () => {
  it("riordina per indice", () => {
    const body = {
      data: [
        { index: 1, embedding: vector(2) },
        { index: 0, embedding: vector(1) },
      ],
    };
    const vectors = parseEmbeddings(body, 2);
    expect(vectors[0]![0]).toBe(1);
    expect(vectors[1]![0]).toBe(2);
  });

  it("rifiuta indici doppi, mancanti o dimensioni errate", () => {
    expect(() => parseEmbeddings({ data: [{ index: 0, embedding: vector(1) }] }, 2)).toThrow();
    expect(() =>
      parseEmbeddings(
        {
          data: [
            { index: 0, embedding: vector(1) },
            { index: 0, embedding: vector(1) },
          ],
        },
        2,
      ),
    ).toThrow();
    expect(() => parseEmbeddings({ data: [{ index: 0, embedding: [1, 2] }] }, 1)).toThrow();
  });
});

describe("embedDocuments", () => {
  it("chiama solo l'host di Voyage con la chiave nell'header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: vector(0.5) }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await embedDocuments([embeddingText(source)], { apiKey: "voyage-test", fetchImpl });
    expect(result).toHaveLength(1);
    expect(calls[0]!.url).toBe(VOYAGE_URL);
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer voyage-test");
    expect(String(calls[0]!.init.body)).toContain('"input_type":"document"');
  });

  it("nessuna chiamata senza testi", async () => {
    const fetchImpl = (async () => {
      throw new Error("non doveva chiamare");
    }) as typeof fetch;
    expect(await embedDocuments([], { apiKey: "k", fetchImpl })).toEqual([]);
  });
});
