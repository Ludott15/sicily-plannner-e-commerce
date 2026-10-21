import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { affiliateClicks, areas, places } from "@/server/db/schema";
import { getPartnerConfig, VERTICAL_PARTNER } from "./partners";
import { recordVerticalClick } from "./vertical-click";
import { buildVerticalHref, type VerticalCallContext } from "./verticals";
import { VERTICALS, type Vertical } from "./vertical-links";

// Verticali affiliate su Postgres locale (npm run test:int). Luogo e area di prova con prefisso int-;
// i click di prova hanno subid int + 12 caratteri esadecimali e si tolgono alla fine.
// La chiave dei link è impostata dal test (vi.stubEnv): .env.local non la contiene.

const SECRET = "test-secret-do-not-use-in-prod";
const s = Date.now();
const areaSlug = `int-vert-area-${s}`;
const placeSlug = `int-vert-luogo-${s}`;
const CTX: VerticalCallContext = { context: "page", itineraryId: null, locale: "it" };
const clickSubids: string[] = [];

function newSubid(): string {
  const subid = `int${randomBytes(6).toString("hex")}`;
  clickSubids.push(subid);
  return subid;
}

const LODGING = { vertical: "lodging", place: placeSlug, checkin: "2026-11-03", checkout: "2026-11-05", adults: 2 } as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeAll(async () => {
  const [area] = await dbAdmin
    .insert(areas)
    .values({ slug: areaSlug, nameIt: `int- Area ${s}`, nameEn: `int- Area ${s}`, sort: 990 })
    .returning({ id: areas.id });
  await dbAdmin.insert(places).values({
    slug: placeSlug,
    name: `int- Luogo ${s}`,
    province: "ME",
    areaId: area!.id,
    lat: 38.1,
    lng: 15.2,
    isActive: true,
  });
});

afterAll(async () => {
  if (clickSubids.length > 0) await dbAdmin.delete(affiliateClicks).where(inArray(affiliateClicks.subid, clickSubids));
  await dbAdmin.delete(places).where(inArray(places.slug, [placeSlug]));
  await dbAdmin.delete(areas).where(inArray(areas.slug, [areaSlug]));
});

describe("disponibilità e link di ricerca", () => {
  it("senza ID nell'ambiente la verticale è pronta e il link non porta nessun ID", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    vi.stubEnv("BOOKING_AFFILIATE_ID", "");
    const result = await buildVerticalHref(LODGING, CTX);
    expect(result).toEqual({
      href: expect.stringMatching(/^\/api\/go\/v\?/),
      partnerName: "Booking.com",
      passesSearch: "full",
    });
    expect((result as { href: string }).href).not.toContain("int-test-partner");
  });

  it("con ID nell'ambiente il link firmato resta senza ID (l'ID entra solo nella route)", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    vi.stubEnv("BOOKING_AFFILIATE_ID", "int-test-partner");
    const result = await buildVerticalHref(LODGING, CTX);
    expect((result as { href: string }).href).not.toContain("int-test-partner");
  });

  it("senza chiave dei link: inattiva, nessun link", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", "");
    expect(await buildVerticalHref(LODGING, CTX)).toEqual({ error: "inactive" });
  });

  it("luogo fuori dal catalogo: non valida; l'area vale solo per l'alloggio", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    expect(await buildVerticalHref({ ...LODGING, place: `int-non-esiste-${s}` }, CTX)).toEqual({ error: "invalid" });
    expect(await buildVerticalHref({ ...LODGING, place: areaSlug }, CTX)).toMatchObject({ href: expect.any(String) });
    expect(await buildVerticalHref({ vertical: "tickets", place: areaSlug }, CTX)).toEqual({ error: "invalid" });
  });

  it("partner che la verticale non serve: non valida", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    expect(await buildVerticalHref({ ...LODGING, partner: "omio" }, CTX)).toEqual({ error: "invalid" });
  });

  it("Hostelworld in un luogo senza pagina verificata: home, nessuna ricerca al partner", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    const result = await buildVerticalHref({ ...LODGING, partner: "hostelworld" }, CTX);
    expect(result).toMatchObject({ partnerName: "Hostelworld", passesSearch: "none" });
  });

  it("alternativa della stessa verticale: il link porta il nome del partner scelto", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    const result = await buildVerticalHref({ ...LODGING, partner: "hostelworld" }, CTX);
    expect(result).toMatchObject({ partnerName: "Hostelworld" });
  });

  it("ricerca fuori dalle liste chiuse (porto inventato): non valida, senza leggere il database", async () => {
    vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
    expect(
      await buildVerticalHref({ vertical: "ferry", from: "atlantide", to: "milazzo", date: "2026-11-03", adults: 2 }, CTX),
    ).toEqual({ error: "invalid" });
  });
});

describe("click per verticale", () => {
  it.each(VERTICALS)("un click di %s si registra con il partner predefinito", async (vertical: Vertical) => {
    const partner = VERTICAL_PARTNER[vertical];
    const config = await getPartnerConfig(partner);
    expect(config?.isActive).toBe(true);
    const subid = newSubid();
    const recorded = await recordVerticalClick({
      user: null,
      partner,
      vertical,
      subId: subid,
      context: "page",
      targetUrl: `https://${config!.allowedHosts[0]}/int`,
      anonId: null,
      itineraryId: null,
    });
    expect(recorded).toBe(true);
    const rows = await dbAdmin.select({ partner: affiliateClicks.partner }).from(affiliateClicks).where(inArray(affiliateClicks.subid, [subid]));
    expect(rows).toEqual([{ partner }]);
  });

  it("click rifiutati: partner inattivo, host fuori allowlist", async () => {
    const inactive = await recordVerticalClick({
      user: null,
      partner: "samboat",
      vertical: "boat",
      subId: newSubid(),
      context: "page",
      targetUrl: "https://www.samboat.com/int",
      anonId: null,
      itineraryId: null,
    });
    expect(inactive).toBe(false);
    const wrongHost = await recordVerticalClick({
      user: null,
      partner: "tiqets",
      vertical: "tickets",
      subId: newSubid(),
      context: "page",
      targetUrl: "https://www.hostelworld.com/int",
      anonId: null,
      itineraryId: null,
    });
    expect(wrongHost).toBe(false);
  });
});
