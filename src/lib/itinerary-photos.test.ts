import { describe, expect, it } from "vitest";
import { assignStopPhotos } from "./itinerary-photos";

describe("assignStopPhotos", () => {
  it("ogni tappa prende la prima foto della sua catena", () => {
    const picked = assignStopPhotos([
      { key: "a", chain: ["act-a", "place-p", "area-x"] },
      { key: "b", chain: [null, "place-q", "area-x"] },
    ]);
    expect(picked.get("a")).toBe("act-a");
    expect(picked.get("b")).toBe("place-q");
  });

  it("non ripete una foto già usata: la tappa successiva scende nella catena", () => {
    const picked = assignStopPhotos([
      { key: "1", chain: [null, "place-p", "area-x"] },
      { key: "2", chain: [null, "place-p", "area-x"] },
      { key: "3", chain: [null, "place-p", "area-x"] },
    ]);
    expect(picked.get("1")).toBe("place-p");
    expect(picked.get("2")).toBe("area-x");
    expect(picked.get("3")).toBeNull();
  });

  it("catena esaurita: nessuna foto, mai un duplicato", () => {
    const picked = assignStopPhotos([
      { key: "1", chain: ["p"] },
      { key: "2", chain: ["p"] },
      { key: "3", chain: [null, null] },
    ]);
    expect([...picked.values()]).toEqual(["p", null, null]);
  });

  it("l'ordine delle tappe decide: chi viene prima ha la foto", () => {
    const first = assignStopPhotos([
      { key: "x", chain: ["shared"] },
      { key: "y", chain: ["shared", "other"] },
    ]);
    expect(first.get("x")).toBe("shared");
    expect(first.get("y")).toBe("other");
    const reversed = assignStopPhotos([
      { key: "y", chain: ["shared", "other"] },
      { key: "x", chain: ["shared"] },
    ]);
    expect(reversed.get("y")).toBe("shared");
    expect(reversed.get("x")).toBeNull();
  });

  it("le foto riservate (copertina dell'itinerario) non compaiono sulle tappe", () => {
    const picked = assignStopPhotos([{ key: "1", chain: ["cover", "place-p"] }], new Set(["cover"]));
    expect(picked.get("1")).toBe("place-p");
  });

  it("l'ordine delle chiavi nella mappa segue quello delle tappe", () => {
    const picked = assignStopPhotos([
      { key: "c", chain: [] },
      { key: "a", chain: ["1"] },
      { key: "b", chain: [] },
    ]);
    expect([...picked.keys()]).toEqual(["c", "a", "b"]);
  });
});
