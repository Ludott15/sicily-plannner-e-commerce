import { describe, expect, it } from "vitest";
import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  addLine,
  cartCount,
  cartItemsFromUnknown,
  setLineQuantity,
  type CartItem,
} from "./cart";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

describe("cartItemsFromUnknown", () => {
  it("legge le righe valide nell'ordine del cookie", () => {
    const items = cartItemsFromUnknown({ v: 1, items: [{ p: A, q: 2 }, { p: B, q: 1 }] });
    expect(items).toEqual([
      { productId: A, quantity: 2 },
      { productId: B, quantity: 1 },
    ]);
  });

  it("scarta le righe non valide e lascia le altre", () => {
    const items = cartItemsFromUnknown({
      v: 1,
      items: [{ p: "non-un-uuid", q: 1 }, { p: A, q: 0 }, { p: A, q: 11 }, { p: B, q: 3 }, "spazzatura", null],
    });
    expect(items).toEqual([{ productId: B, quantity: 3 }]);
  });

  it("ignora i campi in più: un prezzo scritto a mano nel cookie non conta", () => {
    const items = cartItemsFromUnknown({ v: 1, items: [{ p: A, q: 1, price: 1, unitPriceCents: 1 }] });
    expect(items).toEqual([{ productId: A, quantity: 1 }]);
    expect(Object.keys(items[0] ?? {})).toEqual(["productId", "quantity"]);
  });

  it("un prodotto ripetuto si somma, con il tetto di quantità", () => {
    const items = cartItemsFromUnknown({
      v: 1,
      items: [{ p: A, q: 6 }, { p: B, q: 1 }, { p: A, q: 6 }],
    });
    expect(items).toEqual([
      { productId: A, quantity: CART_MAX_QUANTITY },
      { productId: B, quantity: 1 },
    ]);
  });

  it("oltre il limite di righe scarta il resto", () => {
    const many = Array.from({ length: CART_MAX_LINES + 5 }, (_, i) => ({ p: uuidFor(i + 1), q: 1 }));
    const items = cartItemsFromUnknown({ v: 1, items: many });
    expect(items).toHaveLength(CART_MAX_LINES);
    expect(items[CART_MAX_LINES - 1]?.productId).toBe(uuidFor(CART_MAX_LINES));
  });

  it("una versione diversa o un payload non oggetto danno un carrello vuoto", () => {
    expect(cartItemsFromUnknown({ v: 2, items: [{ p: A, q: 1 }] })).toEqual([]);
    expect(cartItemsFromUnknown("testo")).toEqual([]);
    expect(cartItemsFromUnknown(null)).toEqual([]);
  });
});

describe("addLine", () => {
  it("crea la riga o somma la quantità a quella esistente", () => {
    const first = addLine([], A, 2);
    expect(first).toEqual({ ok: true, items: [{ productId: A, quantity: 2 }] });
    if (!first.ok) throw new Error("atteso ok");
    const second = addLine(first.items, A, 3);
    expect(second).toEqual({ ok: true, items: [{ productId: A, quantity: 5 }] });
  });

  it("oltre la quantità massima o il numero di righe risponde limit", () => {
    expect(addLine([{ productId: A, quantity: 8 }], A, 3)).toEqual({ ok: false, code: "limit" });
    const full: CartItem[] = Array.from({ length: CART_MAX_LINES }, (_, i) => ({ productId: uuidFor(i + 1), quantity: 1 }));
    expect(addLine(full, B, 1)).toEqual({ ok: false, code: "limit" });
  });
});

describe("setLineQuantity", () => {
  it("zero rimuove la riga", () => {
    expect(setLineQuantity([{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }], A, 0)).toEqual({
      ok: true,
      items: [{ productId: B, quantity: 1 }],
    });
  });

  it("imposta la quantità della riga esistente", () => {
    expect(setLineQuantity([{ productId: A, quantity: 2 }], A, 7)).toEqual({
      ok: true,
      items: [{ productId: A, quantity: 7 }],
    });
  });

  it("sopra il tetto risponde limit", () => {
    expect(setLineQuantity([{ productId: A, quantity: 2 }], A, CART_MAX_QUANTITY + 1)).toEqual({ ok: false, code: "limit" });
  });
});

describe("cartCount", () => {
  it("conta gli articoli, cioè la somma delle quantità", () => {
    expect(cartCount([{ productId: A, quantity: 2 }, { productId: B, quantity: 3 }])).toBe(5);
    expect(cartCount([])).toBe(0);
  });
});
