import { describe, expect, it } from "vitest";
import { orderTimeline, TIMELINE_STEPS } from "./order-timeline";

const flags = (status: Parameters<typeof orderTimeline>[0]) =>
  orderTimeline(status).map(({ step, done, current }) => `${step}:${done ? "done" : "-"}${current ? ":current" : ""}`);

describe("orderTimeline", () => {
  it("un ordine pagato è in attesa del fornitore", () => {
    expect(flags("paid")).toEqual(["paid:done", "forwarded:-:current", "shipped:-", "delivered:-"]);
  });

  it("un ordine spedito ha inoltro e spedizione fatti; il prossimo passo è la consegna", () => {
    expect(flags("shipped")).toEqual(["paid:done", "forwarded:done", "shipped:done", "delivered:-:current"]);
  });

  it("un ordine consegnato ha tutti i passi fatti e nessuno corrente", () => {
    expect(orderTimeline("delivered").every((state) => state.done && !state.current)).toBe(true);
  });

  it("un ordine annullato o in attesa non mostra progressi", () => {
    for (const status of ["pending", "cancelled"] as const) {
      expect(orderTimeline(status).some((state) => state.done || state.current)).toBe(false);
    }
  });

  it("un rimborso resta con il pagamento fatto e senza passo corrente", () => {
    expect(flags("refunded")).toEqual(["paid:done", "forwarded:-", "shipped:-", "delivered:-"]);
  });

  it("restituisce i passi nell'ordine della linea temporale", () => {
    expect(orderTimeline("paid").map((state) => state.step)).toEqual([...TIMELINE_STEPS]);
  });
});
