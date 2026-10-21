import { describe, expect, it } from "vitest";
import { chosenPhotosSchema, nextChosenOffset } from "./media-chosen";

const valid = { type: "activity", slug: "pescheria-catania", file: "File:Pescheria (Catania) 08.jpg", motivo: "Mercato del pesce", alt_it: "Bancarelle di pesce" };

describe("chosenPhotosSchema", () => {
  it("accetta una voce valida, con allow_sa facoltativo", () => {
    expect(chosenPhotosSchema.safeParse([valid]).success).toBe(true);
    expect(chosenPhotosSchema.safeParse([{ ...valid, allow_sa: true }]).success).toBe(true);
  });

  it("rifiuta tipo sconosciuto, file senza prefisso File:, alt_it vuoto e allow_sa non booleano", () => {
    expect(chosenPhotosSchema.safeParse([{ ...valid, type: "itinerary" }]).success).toBe(false);
    expect(chosenPhotosSchema.safeParse([{ ...valid, file: "Pescheria.jpg" }]).success).toBe(false);
    expect(chosenPhotosSchema.safeParse([{ ...valid, alt_it: "  " }]).success).toBe(false);
    expect(chosenPhotosSchema.safeParse([{ ...valid, allow_sa: "si" }]).success).toBe(false);
  });

  it("rifiuta un elenco vuoto", () => {
    expect(chosenPhotosSchema.safeParse([]).success).toBe(false);
  });
});

describe("nextChosenOffset", () => {
  it("avanza di un lotto finché ci sono voci, poi null", () => {
    expect(nextChosenOffset(0, 3, 7)).toBe(3);
    expect(nextChosenOffset(3, 3, 7)).toBe(6);
    expect(nextChosenOffset(6, 1, 7)).toBeNull();
    expect(nextChosenOffset(0, 3, 3)).toBeNull();
  });
});
