import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import { getPartnerConfig, VERTICAL_PARTNER } from "./partners";
import { verticalAvailability, verticalSearchHref } from "./verticals";

// Richiede il Supabase locale (npm run test:int). Le righe base di affiliate_partners arrivano dalla
// migrazione; gli ID dei partner sono finti e solo nell'ambiente del test.

afterEach(() => {
  vi.unstubAllEnvs();
});

const SEARCH = {
  vertical: "lodging" as const,
  query: "Taormina",
  airport: "",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: 2,
  context: "page" as const,
  itineraryId: null,
  locale: "it",
};

describe("configurazione dei partner", () => {
  it("booking ha template https e host ammessi; un partner sconosciuto dà null", async () => {
    const booking = await getPartnerConfig(VERTICAL_PARTNER.lodging);
    expect(booking?.searchUrlTemplate?.startsWith("https://")).toBe(true);
    expect(booking?.allowedHosts).toContain("www.booking.com");
    expect(await getPartnerConfig("internal")).toBeNull();
    expect(await getPartnerConfig("non_esiste")).toBeNull();
  });

  it("senza ID nell'ambiente la verticale è in arrivo e non si costruisce nessun link", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", "test-secret-do-not-use-in-prod");
    vi.stubEnv("BOOKING_AFFILIATE_ID", "");
    expect(await verticalAvailability("lodging")).toBe("coming_soon");
    expect(await verticalSearchHref(SEARCH)).toBeNull();
  });

  it("con ID e chiave la verticale è pronta e il link è firmato verso /api/go/v", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", "test-secret-do-not-use-in-prod");
    vi.stubEnv("BOOKING_AFFILIATE_ID", "int-test-partner");
    expect(await verticalAvailability("lodging")).toBe("ready");
    const href = await verticalSearchHref(SEARCH);
    expect(href?.startsWith("/api/go/v?")).toBe(true);
    expect(href).not.toContain("int-test-partner");
  });
});

describe("limite dei click", () => {
  it("la funzione SQL consente fino al limite e poi nega", async () => {
    const bucket = `int-${randomBytes(12).toString("base64url")}`;
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const [row] = await dbPublic((tx) =>
        tx.execute<{ allowed: boolean }>(sql`select public.hit_rate_limit(${bucket}, 2, 60) as allowed`),
      );
      results.push(row?.allowed === true);
    }
    expect(results).toEqual([true, true, false]);
  });

  it("un bucket malformato è rifiutato dal database", async () => {
    await expect(
      dbPublic((tx) => tx.execute(sql`select public.hit_rate_limit(${"corto"}, 2, 60)`)),
    ).rejects.toThrow();
  });
});
