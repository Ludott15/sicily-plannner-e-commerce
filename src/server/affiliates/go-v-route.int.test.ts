import { count, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/go/v/route";
import { dbAdmin } from "@/server/db/admin";
import { affiliateClicks, areas, places } from "@/server/db/schema";
import { verticalLinkHref, type VerticalLink } from "./vertical-links";

// GET /api/go/v su Postgres locale (npm run test:int): firma, rate limit, partner inattivo e click
// riuscito, chiamando la route vera. L'utente non è loggato (getUser mock): il click è anonimo.
// Il luogo di prova ha prefisso int-; i click di prova si tolgono alla fine.

vi.mock("@/server/auth", () => ({ getUser: async () => null }));

const SECRET = "test-secret-do-not-use-in-prod";
const s = Date.now();
const areaSlug = `int-go-area-${s}`;
const placeSlug = `int-go-luogo-${s}`;
const NOW = Math.floor(Date.now() / 1000);
const createdSubids: string[] = [];

const LODGING: VerticalLink = {
  partner: "booking",
  vertical: "lodging",
  place: placeSlug,
  from: "",
  to: "",
  date: "",
  kind: "",
  airport: "",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: 2,
  context: "page",
  locale: "it",
  itineraryId: null,
  expiresAt: NOW + 3600,
};

// IP unico per caso: il rate limit conta per IP e il bucket è di questo test.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${(s + ipCounter) % 250}`;
}

function request(href: string, ip: string): NextRequest {
  return new NextRequest(new URL(href, "http://localhost:3000"), { headers: { "x-forwarded-for": ip } });
}

async function clickCount(): Promise<number> {
  const [row] = await dbAdmin.select({ value: count() }).from(affiliateClicks);
  return Number(row?.value ?? 0);
}

beforeAll(async () => {
  vi.stubEnv("AFFILIATE_LINK_SECRET", SECRET);
  vi.stubEnv("BOOKING_AFFILIATE_ID", "");
  vi.stubEnv("RATE_LIMIT_SECRET", "");
  const [area] = await dbAdmin
    .insert(areas)
    .values({ slug: areaSlug, nameIt: `int- Area go ${s}`, nameEn: `int- Area go ${s}`, sort: 991 })
    .returning({ id: areas.id });
  await dbAdmin.insert(places).values({
    slug: placeSlug,
    name: `int- Luogo go ${s}`,
    province: "ME",
    areaId: area!.id,
    lat: 38.1,
    lng: 15.2,
    isActive: true,
  });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (createdSubids.length > 0) await dbAdmin.delete(affiliateClicks).where(inArray(affiliateClicks.subid, createdSubids));
  await dbAdmin.delete(places).where(inArray(places.slug, [placeSlug]));
  await dbAdmin.delete(areas).where(inArray(areas.slug, [areaSlug]));
});

describe("GET /api/go/v", () => {
  it("firma alterata: 400 e nessuna riga", async () => {
    const href = verticalLinkHref(LODGING, SECRET).replace("adults=2", "adults=3");
    const before = await clickCount();
    const response = await GET(request(href, nextIp()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(await clickCount()).toBe(before);
  });

  it("rate limit: oltre 60 richieste nel minuto dallo stesso IP, 303 con avviso e nessuna riga", async () => {
    const ip = nextIp();
    // Ogni richiesta conta nel bucket dell'IP, anche quelle con firma sbagliata (il conteggio viene prima).
    const bad = verticalLinkHref(LODGING, SECRET).replace("adults=2", "adults=3");
    for (let i = 0; i < 60; i++) await GET(request(bad, ip));
    const before = await clickCount();
    const response = await GET(request(verticalLinkHref(LODGING, SECRET), ip));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("avviso=troppi-click");
    expect(response.headers.get("location")).toContain("/it/dove-dormire");
    expect(await clickCount()).toBe(before);
  });

  it("partner inattivo: 303 con avviso non disponibile e nessuna riga", async () => {
    const samboat: VerticalLink = {
      ...LODGING,
      partner: "samboat",
      vertical: "boat",
      place: placeSlug,
      date: "2026-11-03",
      checkin: "",
      checkout: "",
      adults: 0,
    };
    const before = await clickCount();
    const response = await GET(request(verticalLinkHref(samboat, SECRET), nextIp()));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("avviso=non-disponibile");
    expect(response.headers.get("location")).toContain("/it/barche");
    expect(await clickCount()).toBe(before);
  });

  it("click riuscito: 302 verso il partner, con la riga in affiliate_clicks che ha lo stesso subid dell'URL", async () => {
    const before = await clickCount();
    const response = await GET(request(verticalLinkHref(LODGING, SECRET), nextIp()));
    expect(response.status).toBe(302);
    const target = response.headers.get("location");
    expect(target).not.toBeNull();
    const url = new URL(target!);
    expect(url.hostname).toBe("www.booking.com");
    const subid = url.searchParams.get("label");
    expect(subid).toMatch(/^[a-z0-9]{12,32}$/);
    createdSubids.push(subid!);
    expect(url.searchParams.has("aid")).toBe(false);
    expect(await clickCount()).toBe(before + 1);
    const [row] = await dbAdmin
      .select({ subid: affiliateClicks.subid, targetUrl: affiliateClicks.targetUrl, partner: affiliateClicks.partner })
      .from(affiliateClicks)
      .where(inArray(affiliateClicks.subid, [subid!]));
    expect(row).toEqual({ subid, targetUrl: target, partner: "booking" });
  });
});

