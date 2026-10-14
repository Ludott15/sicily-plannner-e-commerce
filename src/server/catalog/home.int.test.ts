import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { areas, itineraries, itineraryItems, media, places } from "@/server/db/schema";
import { getHomeHero, listFeaturedPlaces, listTemplates } from "@/server/catalog/queries";

// Home (contratto 1.2) letta come il pubblico (dbPublic): carosello dei luoghi in evidenza,
// hero e aree delle tappe degli itinerari pronti. Tutto ha il prefisso int-; i risultati si
// filtrano per il suffisso di questa esecuzione, così il seed non conta.
// Il hero è uno solo nel database: quello del seed (se c'è) si toglie per il test e si
// ripristina in afterAll.

const s = Date.now();
const tag = `h${s}`;
const id = () => randomUUID();
const slug = (name: string) => `int-home-${name}-${tag}`;

const [fPhoto, fNoArea, fIllustration, fNotFeatured, fInactive, hero, stopB, stopNoArea] = [
  id(),
  id(),
  id(),
  id(),
  id(),
  id(),
  id(),
  id(),
];
const [illA, illB, illOwn, photoFeatured, photoFeaturedNoArea, photoHero] = [id(), id(), id(), id(), id(), id()];
const [areaA, areaB] = [id(), id()];
const templateId = id();

const allPlaceIds = [fPhoto, fNoArea, fIllustration, fNotFeatured, fInactive, hero, stopB, stopNoArea];
const allMediaIds = [illA, illB, illOwn, photoFeatured, photoFeaturedNoArea, photoHero];

let previousHeroIds: string[] = [];

const photo = (mediaId: string) => ({
  id: mediaId,
  storagePath: `${mediaId}/master.jpg`,
  width: 2000,
  height: 1500,
  kind: "photo" as const,
  sourceType: "own" as const,
  altIt: `int- foto ${mediaId.slice(0, 4)}`,
  author: "Autore int",
  license: "CC0 1.0",
  variantsVersion: 1,
  originalFilename: `int-${mediaId}.jpg`,
});

const illustration = (mediaId: string, name: string) => ({
  id: mediaId,
  storagePath: `${mediaId}/illustration.svg`,
  width: 1600,
  height: 1000,
  kind: "illustration" as const,
  sourceType: "illustration" as const,
  altIt: `int- illustrazione ${name}`,
  originalFilename: `int-${mediaId}.svg`,
});

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    previousHeroIds = (await tx.select({ id: places.id }).from(places).where(eq(places.isHomeHero, true))).map(
      (r) => r.id,
    );
    await tx.update(places).set({ isHomeHero: false }).where(eq(places.isHomeHero, true));

    await tx
      .insert(media)
      .values([
        illustration(illA, "area a"),
        illustration(illB, "area b"),
        illustration(illOwn, "propria"),
        photo(photoFeatured),
        photo(photoFeaturedNoArea),
        photo(photoHero),
      ]);
    await tx.insert(areas).values([
      { id: areaA, slug: slug("area-a"), nameIt: "int- area a", nameEn: "int- area a en", sort: 990, coverMediaId: illA },
      { id: areaB, slug: slug("area-b"), nameIt: "int- area b", nameEn: "int- area b en", sort: 991, coverMediaId: illB },
    ]);

    const place = (pid: string, name: string, values: Partial<typeof places.$inferInsert>) => ({
      id: pid,
      slug: slug(name),
      name: `int- ${name}`,
      province: "SR",
      lat: 37,
      lng: 15,
      ...values,
    });
    await tx.insert(places).values([
      place(fPhoto, "f-foto", {
        areaId: areaA,
        coverMediaId: photoFeatured,
        isFeatured: true,
        featuredOrder: 2,
        taglineIt: "int- tagline",
      }),
      place(fNoArea, "f-senza-area", {
        areaId: null,
        coverMediaId: photoFeaturedNoArea,
        isFeatured: true,
        featuredOrder: 1,
      }),
      place(fIllustration, "f-illustrazione", { areaId: areaA, coverMediaId: illOwn, isFeatured: true, featuredOrder: 3 }),
      place(fNotFeatured, "f-non-in-evidenza", { areaId: areaA, coverMediaId: photoFeatured }),
      place(fInactive, "f-inattivo", {
        areaId: areaA,
        coverMediaId: photoFeatured,
        isFeatured: true,
        featuredOrder: 4,
        isActive: false,
      }),
      place(hero, "hero", { areaId: areaB, coverMediaId: photoHero, isHomeHero: true }),
      place(stopB, "tappa-b", { areaId: areaB }),
      place(stopNoArea, "tappa-senza-area", { areaId: null }),
    ]);

    await tx.insert(itineraries).values({
      id: templateId,
      title: "int- pronto home",
      slug: slug("pronto"),
      isTemplate: true,
      days: 2,
    });
    await tx.insert(itineraryItems).values([
      { itineraryId: templateId, dayIndex: 0, position: 0, placeId: fPhoto },
      { itineraryId: templateId, dayIndex: 0, position: 1, placeId: stopB },
      { itineraryId: templateId, dayIndex: 1, position: 0, placeId: fPhoto },
      { itineraryId: templateId, dayIndex: 1, position: 1, placeId: stopNoArea },
    ]);
  });
});

afterAll(async () => {
  await dbAdmin.delete(itineraries).where(inArray(itineraries.id, [templateId]));
  await dbAdmin.delete(places).where(inArray(places.id, allPlaceIds));
  await dbAdmin.delete(areas).where(inArray(areas.id, [areaA, areaB]));
  await dbAdmin.delete(media).where(inArray(media.id, allMediaIds));
  if (previousHeroIds.length > 0) {
    await dbAdmin.update(places).set({ isHomeHero: true }).where(inArray(places.id, previousHeroIds));
  }
});

describe("carosello dei luoghi in evidenza", () => {
  it("solo luoghi in evidenza, attivi, con foto propria, in ordine di featured_order, con tagline e area", async () => {
    const mine = (await listFeaturedPlaces()).filter((p) => p.slug.endsWith(`-${tag}`));
    expect(mine.map((p) => p.slug)).toEqual([slug("f-senza-area"), slug("f-foto")]);
    expect(mine[0]).toMatchObject({
      taglineIt: null,
      areaNameIt: null,
      areaNameEn: null,
      cover: { id: photoFeaturedNoArea, kind: "photo" },
    });
    expect(mine[1]).toMatchObject({
      taglineIt: "int- tagline",
      areaNameIt: "int- area a",
      areaNameEn: "int- area a en",
      cover: { id: photoFeatured, kind: "photo" },
    });
  });
});

describe("hero della home", () => {
  it("usa la foto propria del luogo; con illustrazione propria ripiega sull'area; senza nulla, niente immagine", async () => {
    expect(await getHomeHero()).toMatchObject({
      placeSlug: slug("hero"),
      placeName: "int- hero",
      cover: { source: "own", media: { id: photoHero } },
    });

    await dbAdmin.update(places).set({ coverMediaId: illOwn }).where(eq(places.id, hero));
    expect(await getHomeHero()).toMatchObject({
      placeSlug: slug("hero"),
      cover: { source: "area", media: { id: illB } },
    });

    await dbAdmin.update(places).set({ coverMediaId: null, areaId: null }).where(eq(places.id, hero));
    expect(await getHomeHero()).toMatchObject({ placeSlug: slug("hero"), cover: null });

    await dbAdmin.update(places).set({ coverMediaId: photoHero, areaId: areaB }).where(eq(places.id, hero));
  });

  it("un hero disattivato non compare", async () => {
    await dbAdmin.update(places).set({ isActive: false }).where(eq(places.id, hero));
    expect(await getHomeHero()).toBeNull();
    await dbAdmin.update(places).set({ isActive: true }).where(eq(places.id, hero));
  });
});

describe("itinerari pronti in home", () => {
  it("elenca le aree dei luoghi delle tappe senza ripetizioni, in ordine di prima apparizione", async () => {
    const template = (await listTemplates()).find((t) => t.slug === slug("pronto"));
    expect(template?.areaNamesIt).toEqual(["int- area a", "int- area b"]);
    expect(template?.areaNamesEn).toEqual(["int- area a en", "int- area b en"]);
  });
});
