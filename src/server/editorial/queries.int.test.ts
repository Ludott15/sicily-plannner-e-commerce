import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import {
  activities,
  activityInterests,
  guideLinks,
  guides,
  itineraries,
  itineraryItems,
  places,
  producers,
  products,
  suppliers,
} from "@/server/db/schema";
import { getGuide, listGuides, listGuideSlugs } from "./queries";

// Guide pubblicate e collegamenti, letti come il pubblico (dbPublic). Tutto ha il prefisso int-.
// Le letture filtrano sui propri slug: il database locale può avere guide e attività vere.

const tag = `g${Date.now()}`;
const id = () => randomUUID();
const slug = (name: string) => `int-guide-${name}-${tag}`;

const ids = {
  placeOpen: id(),
  placeClosed: id(),
  activityOpen: id(),
  activityClosed: id(),
  template: id(),
  templateDraft: id(),
  producer: id(),
  supplier: id(),
  productOpen: id(),
  productClosed: id(),
  published: id(),
  translated: id(),
  draft: id(),
};

const allGuideIds = [ids.published, ids.translated, ids.draft];
const allPlaceIds = [ids.placeOpen, ids.placeClosed];
const allActivityIds = [ids.activityOpen, ids.activityClosed];
const allProductIds = [ids.productOpen, ids.productClosed];
const allTemplateIds = [ids.template, ids.templateDraft];

const place = (pid: string, name: string, isActive: boolean) => ({
  id: pid,
  slug: slug(name),
  name: `int- ${name}`,
  province: "PA",
  lat: 38.1,
  lng: 13.3,
  isActive,
});

const activity = (aid: string, placeId: string, title: string) => ({
  id: aid,
  slug: slug(title.replace(/\s+/g, "-")),
  placeId,
  title: `int- ${title}`,
  durationMin: 60,
  seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  isActive: false,
});

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(places).values([place(ids.placeOpen, "aperto", true), place(ids.placeClosed, "chiuso", false)]);
    await tx.insert(activities).values([
      activity(ids.activityOpen, ids.placeOpen, "attivita aperta"),
      activity(ids.activityClosed, ids.placeClosed, "attivita in luogo chiuso"),
    ]);
    await tx.insert(activityInterests).values(
      allActivityIds.map((activityId) => ({ activityId, interestKey: "sea", strength: 2 })),
    );
    // Attivazione dopo i tag. L'attività del luogo chiuso resta inattiva (trigger activity_place_inactive).
    await tx.update(activities).set({ isActive: true }).where(inArray(activities.id, [ids.activityOpen]));

    // Itinerario pronto (template pubblico) e itinerario personale (non pubblico).
    await tx.insert(itineraries).values([
      {
        id: ids.template,
        title: "int- itinerario pronto",
        slug: slug("itinerario-pronto"),
        isTemplate: true,
        days: 1,
        status: "planned",
      },
      // Itinerario pronto ma non pubblicato (senza slug): non deve entrare nei collegamenti.
      { id: ids.templateDraft, title: "int- itinerario in bozza", slug: null, isTemplate: true, days: 1, status: "planned" },
    ]);
    await tx.insert(itineraryItems).values([{ itineraryId: ids.template, dayIndex: 0, position: 0, activityId: ids.activityOpen }]);

    await tx.insert(suppliers).values({ id: ids.supplier, name: "int- fornitore", kind: "manual", contactEmail: `int-${tag}@example.com` });
    await tx.insert(producers).values({
      id: ids.producer,
      slug: slug("produttore"),
      name: "int- produttore",
      email: `int-${tag}@example.com`,
      isPublic: true,
      isActive: true,
    });
    await tx.insert(products).values([
      {
        id: ids.productOpen,
        slug: slug("prodotto-aperto"),
        producerId: ids.producer,
        supplierId: ids.supplier,
        supplierSku: slug("sku-aperto"),
        title: "int- prodotto aperto",
        category: "dolci",
        formatLabel: "pacco 200 g",
        ingredientsIt: "Farina, uova",
        priceCents: 1000,
        vatRate: 4,
        weightG: 100,
        isActive: true,
        allergensDeclared: true,
      },
      {
        id: ids.productClosed,
        slug: slug("prodotto-chiuso"),
        producerId: ids.producer,
        supplierId: ids.supplier,
        supplierSku: slug("sku-chiuso"),
        title: "int- prodotto chiuso",
        category: "dolci",
        priceCents: 1000,
        vatRate: 4,
        weightG: 100,
        isActive: false,
      },
    ]);

    await tx.insert(guides).values([
      {
        id: ids.published,
        slug: slug("pubblicata"),
        titleIt: "int- Guida pubblicata",
        summaryIt: "Riassunto italiano",
        bodyIt: "## Titolo\n\nTesto italiano.",
        authorName: "int- Autrice",
        status: "published",
        publishedAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        id: ids.translated,
        slug: slug("tradotta"),
        titleIt: "int- Guida tradotta",
        titleEn: "int- Translated guide",
        summaryIt: "Riassunto italiano",
        summaryEn: "English summary",
        bodyIt: "Testo italiano.",
        bodyEn: "English text.",
        authorName: "int- Autrice",
        status: "published",
        publishedAt: new Date("2026-10-02T10:00:00Z"),
      },
      {
        id: ids.draft,
        slug: slug("bozza"),
        titleIt: "int- Bozza",
        bodyIt: "Testo di bozza.",
        authorName: "int- Autrice",
        status: "draft",
      },
    ]);

    // Collegamenti della guida pubblicata: quelli pubblici e quelli no.
    await tx.insert(guideLinks).values([
      { guideId: ids.published, kind: "place", targetId: ids.placeOpen, position: 0 },
      { guideId: ids.published, kind: "place", targetId: ids.placeClosed, position: 1 },
      { guideId: ids.published, kind: "activity", targetId: ids.activityOpen, position: 2 },
      { guideId: ids.published, kind: "activity", targetId: ids.activityClosed, position: 3 },
      { guideId: ids.published, kind: "itinerary", targetId: ids.template, position: 4 },
      { guideId: ids.published, kind: "itinerary", targetId: ids.templateDraft, position: 5 },
      { guideId: ids.published, kind: "product", targetId: ids.productOpen, position: 6 },
      { guideId: ids.published, kind: "product", targetId: ids.productClosed, position: 7 },
      // Un collegamento a una bozza: anche la bozza non deve comparire tra i collegamenti di altre guide.
      { guideId: ids.draft, kind: "place", targetId: ids.placeOpen, position: 0 },
    ]);
  });
});

afterAll(async () => {
  await dbAdmin.delete(guides).where(inArray(guides.id, allGuideIds));
  await dbAdmin.delete(itineraries).where(inArray(itineraries.id, allTemplateIds));
  await dbAdmin.delete(products).where(inArray(products.id, allProductIds));
  await dbAdmin.delete(producers).where(inArray(producers.id, [ids.producer]));
  await dbAdmin.delete(suppliers).where(inArray(suppliers.id, [ids.supplier]));
  await dbAdmin.delete(activities).where(inArray(activities.id, allActivityIds));
  await dbAdmin.delete(places).where(inArray(places.id, allPlaceIds));
});

describe("guide pubblicate (dbPublic)", () => {
  it("la bozza non si vede: né nell'elenco né per slug", async () => {
    const slugs = (await listGuides("it")).map((g) => g.slug);
    expect(slugs).toContain(slug("pubblicata"));
    expect(slugs).not.toContain(slug("bozza"));
    expect(await getGuide(slug("bozza"), "it")).toBeNull();
    expect(await listGuideSlugs()).not.toContain(slug("bozza"));
  });

  it("la guida pubblicata si vede con autore, data e testo", async () => {
    const guide = await getGuide(slug("pubblicata"), "it");
    expect(guide).toMatchObject({
      slug: slug("pubblicata"),
      title: "int- Guida pubblicata",
      summary: "Riassunto italiano",
      author: "int- Autrice",
      publishedAt: "2026-10-01T10:00:00.000Z",
      body: "## Titolo\n\nTesto italiano.",
      translated: true,
      cover: null,
    });
    expect(guide?.updatedAt).toEqual(expect.any(String));
    const listed = (await listGuides("it")).find((g) => g.slug === slug("pubblicata"));
    expect(listed).toMatchObject({ title: "int- Guida pubblicata", publishedAt: "2026-10-01T10:00:00.000Z" });
  });

  it("in inglese mostra il testo inglese solo se la guida è tradotta per intero", async () => {
    const translated = await getGuide(slug("tradotta"), "en");
    expect(translated).toMatchObject({
      title: "int- Translated guide",
      summary: "English summary",
      body: "English text.",
      translated: true,
    });

    const untranslated = await getGuide(slug("pubblicata"), "en");
    expect(untranslated).toMatchObject({ title: "int- Guida pubblicata", body: "## Titolo\n\nTesto italiano.", translated: false });
  });

  it("i collegamenti si risolvono solo verso bersagli pubblici, nell'ordine della guida", async () => {
    const guide = await getGuide(slug("pubblicata"), "it");
    const ours = (guide?.links ?? []).filter((link) => link.title.startsWith("int-"));
    expect(ours).toEqual([
      { kind: "place", slug: slug("aperto"), title: "int- aperto" },
      { kind: "activity", slug: slug("attivita-aperta"), title: "int- attivita aperta" },
      { kind: "itinerary", slug: slug("itinerario-pronto"), title: "int- itinerario pronto" },
      { kind: "product", slug: slug("prodotto-aperto"), title: "int- prodotto aperto" },
    ]);
  });

  it("le guide pubblicate sono nella lista delle sitemap", async () => {
    expect(await listGuideSlugs()).toContain(slug("pubblicata"));
  });
});
