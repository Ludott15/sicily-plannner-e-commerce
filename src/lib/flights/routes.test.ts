import { describe, expect, it } from "vitest";
import { DEPARTURE_AIRPORTS, getDeparture } from "./departures";
import { findPopularRoute, POPULAR_ROUTES } from "./routes";
import { SICILY_AIRPORT_CODES } from "./airports";
import { nextMonth, pickBest, calendarDays, type OfferPrice } from "./offers";

describe("POPULAR_ROUTES", () => {
  it("20 coppie con slug unici di tipo città-città", () => {
    expect(POPULAR_ROUTES).toHaveLength(20);
    const slugs = POPULAR_ROUTES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const route of POPULAR_ROUTES) expect(route.slug).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("ogni origine è un aeroporto di partenza e ogni destinazione un aeroporto siciliano", () => {
    for (const route of POPULAR_ROUTES) {
      expect(getDeparture(route.origin)).not.toBeNull();
      expect((SICILY_AIRPORT_CODES as readonly string[]).includes(route.destination)).toBe(true);
    }
    expect(DEPARTURE_AIRPORTS.length).toBeGreaterThan(0);
  });

  it("findPopularRoute trova per slug e restituisce null altrove", () => {
    expect(findPopularRoute("milano-catania")).toEqual({ slug: "milano-catania", origin: "MXP", destination: "CTA" });
    expect(findPopularRoute("roma-lampedusa")).toBeNull();
  });
});

describe("offers", () => {
  const price = (over: Partial<OfferPrice>): OfferPrice => ({
    origin: "FCO",
    destination: "CTA",
    departureAt: "2026-11-03T08:00:00+01:00",
    returnAt: null,
    price: 100,
    airline: "FR",
    transfers: 0,
    updatedAt: "2026-10-14T00:00:00.000Z",
    ...over,
  });

  it("pickBest: il prezzo più basso, a parità la partenza più vicina; null senza offerte", () => {
    expect(pickBest([])).toBeNull();
    const best = pickBest([
      price({ price: 120 }),
      price({ price: 80, departureAt: "2026-11-09T08:00:00+01:00" }),
      price({ price: 80, departureAt: "2026-11-05T08:00:00+01:00" }),
    ]);
    expect(best?.price).toBe(80);
    expect(best?.departureAt).toBe("2026-11-05T08:00:00+01:00");
  });

  it("calendarDays: minimo per giorno, in ordine di data, senza date non valide", () => {
    const days = calendarDays([
      price({ departureAt: "2026-11-05T10:00:00+01:00", price: 90 }),
      price({ departureAt: "2026-11-05T18:00:00+01:00", price: 70 }),
      price({ departureAt: "2026-11-02T10:00:00+01:00", price: 150 }),
      price({ departureAt: "domani", price: 10 }),
    ]);
    expect(days).toEqual([
      { date: "2026-11-02", price: 150 },
      { date: "2026-11-05", price: 70 },
    ]);
  });

  it("nextMonth: mese successivo in YYYY-MM, anche a cavallo d'anno", () => {
    expect(nextMonth(new Date(Date.UTC(2026, 9, 14)))).toBe("2026-11");
    expect(nextMonth(new Date(Date.UTC(2026, 11, 31)))).toBe("2027-01");
  });
});
