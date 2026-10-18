import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openCartValue, sealCartValue } from "./cart-seal";

const SECRET = "test-cart-secret";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// Firma un corpo qualunque con il segreto: serve a costruire cookie con firma valida ma contenuto forzato.
function signedBy(body: string, secret: string): string {
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe("cookie del carrello firmato", () => {
  it("il valore sigillato si riapre con lo stesso segreto", () => {
    const items = [
      { productId: A, quantity: 2 },
      { productId: B, quantity: 5 },
    ];
    expect(openCartValue(sealCartValue(items, SECRET), SECRET)).toEqual(items);
  });

  it("corpo alterato con la firma originale: carrello vuoto", () => {
    const sealed = sealCartValue([{ productId: A, quantity: 1 }], SECRET);
    const signature = sealed.slice(sealed.lastIndexOf(".") + 1);
    const forged = Buffer.from(JSON.stringify({ v: 1, items: [{ p: A, q: 9 }] }), "utf8").toString("base64url");
    expect(openCartValue(`${forged}.${signature}`, SECRET)).toEqual([]);
  });

  it("firma di un altro segreto: carrello vuoto", () => {
    const value = sealCartValue([{ productId: A, quantity: 1 }], "altro-segreto");
    expect(openCartValue(value, SECRET)).toEqual([]);
  });

  it("valore assente, senza punto o con firma troncata: carrello vuoto", () => {
    expect(openCartValue(undefined, SECRET)).toEqual([]);
    expect(openCartValue("nessunpunto", SECRET)).toEqual([]);
    const sealed = sealCartValue([{ productId: A, quantity: 1 }], SECRET);
    expect(openCartValue(sealed.slice(0, -4), SECRET)).toEqual([]);
  });

  it("un prezzo scritto nel cookie con firma valida non entra nel carrello", () => {
    const body = Buffer.from(
      JSON.stringify({ v: 1, items: [{ p: A, q: 1, unitPriceCents: 1, price: 1 }] }),
      "utf8",
    ).toString("base64url");
    const items = openCartValue(signedBy(body, SECRET), SECRET);
    expect(items).toEqual([{ productId: A, quantity: 1 }]);
    expect(items[0]).not.toHaveProperty("unitPriceCents");
  });

  it("JSON non valido con firma valida: carrello vuoto, nessun errore", () => {
    const body = Buffer.from("{non json", "utf8").toString("base64url");
    expect(openCartValue(signedBy(body, SECRET), SECRET)).toEqual([]);
  });
});
