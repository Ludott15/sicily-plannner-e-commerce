import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, guides, itineraries, places } from "@/server/db/schema";
import { SEARCH_KINDS } from "./model";
import { searchSite } from "./queries";

// Ricerca nel sito (passo 11.2) contro il database locale, come la vede il pubblico (dbPublic).
// Tutto ha il prefisso int-. Le asserzioni cercano i propri slug: il database può avere dati veri.

const PLACE = "int-search-favignana";
const ACTIVITY = "int-search-tonnara";
const ACTIVITY_CLOSED = "int-search-tonnara-chiusa";
const TEMPLATE = "int-search-itinerario";
const GUIDE = "int-search-guida";
const GUIDE_DRAFT = "int-search-guida-bozza";

const ids = {
  place: "99999999-aaaa-4000-8000-000000000001",
  placeClosed: "99999999-aaaa-4000-8000-000000000002",
  activity: "99999999-bbbb-4000-8000-000000000001",
  activityClosed: "99999999-bbbb-4000-8000-000000000002",
  template: "99999999-cccc-4000-8000-000000000001",
  guide: "99999999-dddd-4000-8000-000000000001",
  guideDraft: "99999999-dddd-4000-8000-000000000002",
};

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(places).values([
      { id: ids.place, slug: PLACE, name: "int- Favignana", province: "TP", lat: 37.93, lng: 12.32, isActive: true },
      { id: ids.placeClosed, slug: "int-search-luogo-chiuso", name: "int- Luogo chiuso", province: "TP", lat: 37.9, lng: 12.3, isActive: false },
    ]);
    // L'attività nasce inattiva; si attiva dopo i tag (trigger activities_require_tags).
    await tx.insert(activities).values([
      { id: ids.activity, slug: ACTIVITY, placeId: ids.place, title: "int- Tonnara di Favignana", durationMin: 60, seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], isActive: false },
      { id: ids.activityClosed, slug: ACTIVITY_CLOSED, placeId: ids.place, title: "int- Tonnara chiusa", durationMin: 60, seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], isActive: false },
    ]);
    await tx.insert(activityInterests).values({ activityId: ids.activity, interestKey: "sea", strength: 2 });
    await tx.update(activities).set({ isActive: true }).where(inArray(activities.id, [ids.activity]));

    await tx.insert(itineraries).values({
      id: ids.template,
      slug: TEMPLATE,
      title: "int- Itinerario Favignana",
      isTemplate: true,
      ownerId: null,
      days: 2,
    });

    await tx.insert(guides).values([
      { id: ids.guide, slug: GUIDE, titleIt: "int- Guida a Favignana", bodyIt: "Testo.", authorName: "Autore di prova", status: "published", publishedAt: new Date() },
      { id: ids.guideDraft, slug: GUIDE_DRAFT, titleIt: "int- Bozza su Favignana", bodyIt: "Testo.", authorName: "Autore di prova", status: "draft" },
    ]);
  });
});

afterAll(async () => {
  await dbAdmin.delete(guides).where(inArray(guides.id, [ids.guide, ids.guideDraft]));
  await dbAdmin.delete(itineraries).where(inArray(itineraries.id, [ids.template]));
  await dbAdmin.delete(activities).where(inArray(activities.id, [ids.activity, ids.activityClosed]));
  await dbAdmin.delete(places).where(inArray(places.id, [ids.place, ids.placeClosed]));
});

function slugsOf(groups: Awaited<ReturnType<typeof searchSite>>["groups"]): string[] {
  return groups.flatMap((group) => group.hits.map((hit) => hit.slug));
}

describe("searchSite", () => {
  it("trova un luogo per titolo, con il percorso pubblico", async () => {
    const result = await searchSite("Favignana", "it", 3);
    const place = result.groups.find((group) => group.kind === "place")?.hits.find((hit) => hit.slug === PLACE);
    expect(place).toEqual({ kind: "place", slug: PLACE, title: "int- Favignana", subtitle: "TP", href: `/luoghi/${PLACE}` });
  });

  it("tollera un errore di battitura", async () => {
    const result = await searchSite("Favignama", "it", 3);
    expect(slugsOf(result.groups)).toContain(PLACE);
  });

  it("trova senza accento un titolo con accento e viceversa", async () => {
    const withAccent = await searchSite("Favignàna", "it", 3);
    expect(slugsOf(withAccent.groups)).toContain(PLACE);
    const withoutAccent = await searchSite("tonnara favignana", "it", 3);
    expect(slugsOf(withoutAccent.groups)).toContain(ACTIVITY);
  });

  it("non mostra attività inattive, guide in bozza né luoghi chiusi", async () => {
    const result = await searchSite("Favignana", "it", 10);
    const slugs = slugsOf(result.groups);
    expect(slugs).not.toContain(ACTIVITY_CLOSED);
    expect(slugs).not.toContain(GUIDE_DRAFT);
    expect(slugs).not.toContain("int-search-luogo-chiuso");
  });

  it("raggruppa nell'ordine place, activity, itinerary, guide con i risultati attesi", async () => {
    const result = await searchSite("Favignana", "it", 3);
    const kinds = result.groups.map((group) => group.kind);
    const positions = kinds.map((kind) => SEARCH_KINDS.indexOf(kind));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(kinds).toEqual(expect.arrayContaining(["place", "activity", "itinerary", "guide"]));
    expect(slugsOf(result.groups)).toEqual(expect.arrayContaining([PLACE, ACTIVITY, TEMPLATE, GUIDE]));
    expect(result.total).toBe(result.groups.reduce((sum, group) => sum + group.hits.length, 0));
  });

  it("una query sotto 2 caratteri non produce gruppi", async () => {
    expect(await searchSite("f", "it", 3)).toEqual({ query: "", total: 0, groups: [] });
  });
});
