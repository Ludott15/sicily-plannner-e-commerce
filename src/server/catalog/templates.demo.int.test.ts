import { and, eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PUBLISH_CHECK_CODES } from "@/lib/itinerary-checks";
import { dbAdmin } from "@/server/db/admin";
import { itineraries } from "@/server/db/schema";
import { DAILY_HOURS } from "@/server/personalization/config";
import { templateChecks } from "./templates.admin";

// Itinerari demo del seed (supabase/seed.sql, con npm run media:demo per le foto). Questo test
// dipende dal seed di proposito: verifica che i template demo passino i controlli di pubblicazione,
// quindi restano pubblicabili. Gli altri test non dipendono dal seed.

describe("itinerari demo del seed", () => {
  it("sono sei e ognuno passa tutti i controlli di pubblicazione", async () => {
    const rows = await dbAdmin
      .select({ id: itineraries.id, slug: itineraries.slug })
      .from(itineraries)
      .where(and(eq(itineraries.isTemplate, true), like(itineraries.slug, "demo-%")));
    expect(rows).toHaveLength(6);

    const results = await Promise.all(
      rows.map(async (row) => ({
        slug: row.slug,
        checks: await dbAdmin.transaction((tx) => templateChecks(tx, row.id, DAILY_HOURS)),
      })),
    );
    for (const { slug, checks } of results) {
      const label = slug ?? "";
      expect(checks.map((check) => check.code), label).toEqual([...PUBLISH_CHECK_CODES]);
      expect(checks.filter((check) => !check.ok), label).toEqual([]);
    }
  });
});
