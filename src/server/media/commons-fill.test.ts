import { describe, expect, it } from "vitest";
import { isPertinent, photoTarget } from "./commons-target";

const need = (over: Partial<Parameters<typeof photoTarget>[0]>) => ({
  type: "activity" as const,
  id: "00000000-0000-4000-8000-000000000001",
  slug: "s",
  name: "Teatro Antico",
  placeName: "Taormina",
  lat: 37.85,
  lng: 15.28,
  current: "none" as const,
  ...over,
});

describe("isPertinent", () => {
  it("un'attività vale solo con una parola che non sia del solo luogo", () => {
    const activity = need({ type: "activity", placeName: "Taormina" });
    // Una veduta generica di Taormina non basta per "Teatro Antico di Taormina".
    expect(isPertinent(activity, { matched: ["taormina"] })).toBe(false);
    expect(isPertinent(activity, { matched: ["teatro", "taormina"] })).toBe(true);
    expect(isPertinent(activity, { matched: [] })).toBe(false);
  });

  it("un luogo vale con almeno una parola del nome, non con la sola vicinanza", () => {
    const place = need({ type: "place", placeName: null });
    expect(isPertinent(place, { matched: [] })).toBe(false);
    expect(isPertinent(place, { matched: ["noto"] })).toBe(true);
  });
});

describe("photoTarget", () => {
  it("attività: titolo e luogo come query, con il nome del titolo per la pertinenza", () => {
    const target = photoTarget(need({ type: "activity", name: "Teatro Antico", placeName: "Taormina" }));
    expect(target.query).toBe("teatro antico taormina");
    expect(target.name).toBe("Teatro Antico");
    expect(target.requireNameMatch).toBe(true);
  });

  it("luogo: vicinanza o nome, senza obbligo di nome nel file", () => {
    const target = photoTarget(need({ type: "place", name: "Noto", placeName: null }));
    expect(target.requireNameMatch).toBe(false);
    expect(target.lat).toBe(37.85);
  });

  it("area: ricerca per nome in Sicilia, senza coordinate", () => {
    const target = photoTarget(need({ type: "area", name: "Val di Noto", placeName: null, lat: null, lng: null }));
    expect(target.query).toContain("Sicilia");
    expect(target.lat).toBeNull();
  });
});
