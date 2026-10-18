import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { externalIdFor } from "./external-id";

const BASE = { partner: "viator", subid: "abcdef0123456789", reportedAt: "2026-10-01", amountEur: "45.00" };

describe("externalIdFor", () => {
  it("è sha256 in hex di partner|subid|reported_at|amount_eur", () => {
    const expected = createHash("sha256").update("viator|abcdef0123456789|2026-10-01|45.00").digest("hex");
    expect(externalIdFor(BASE)).toBe(expected);
  });

  it("è stabile: stessi dati, stesso id", () => {
    expect(externalIdFor(BASE)).toBe(externalIdFor({ ...BASE }));
  });

  it("cambia se cambia un campo che lo compone", () => {
    const id = externalIdFor(BASE);
    expect(externalIdFor({ ...BASE, partner: "civitatis" })).not.toBe(id);
    expect(externalIdFor({ ...BASE, subid: "abcdef0123456780" })).not.toBe(id);
    expect(externalIdFor({ ...BASE, reportedAt: "2026-10-02" })).not.toBe(id);
    expect(externalIdFor({ ...BASE, amountEur: "45.50" })).not.toBe(id);
  });
});
