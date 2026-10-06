import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { closeConnection } from "./connection";
import { activities, activityInterests, areas, imageAuthorizations, itineraries, itineraryItems, media, places } from "@/server/db/schema";
import { getActivity, getPlace, getTemplate, listFeaturedPlaces } from "@/server/catalog/queries";

// Catena di ripiego e carosello letti come il pubblico (dbPublic → RLS di media), e controlli
// di lancio sulle immagini. Nessun file nello storage: qui contano le righe e la RLS.
// Tutto ha il prefisso int-: la pulizia globale rimuove i residui.

const s = Date.now();
const id = () => randomUUID();
const areaId = id();
const [illustration, photoOk, photoNoAlt, photoExpired, photoActivity] = [id(), id(), id(), id(), id()];
const authorization = id();
const [placeOk, placeNoAlt, placeExpired, placeNoPhoto] = [id(), id(), id(), id()];
const [activityOnPlace, activityOwn, activityOnArea] = [id(), id(), id()];
const templateId = id();
const slug = (name: string) => `int-${name}-${s}`;

const photo = (mediaId: string, extra: Partial<typeof media.$inferInsert> = {}) => ({
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
  ...extra,
});

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(imageAuthorizations).values({
      id: authorization,
      authority: "int- Parco",
      reference: "int-1",
      issuedOn: "2020-01-01",
      validUntil: "2020-12-31",
      scope: "int",
    });
    await tx.insert(media).values([
      {
        id: illustration,
        storagePath: `${illustration}/illustration.svg`,
        width: 1600,
        height: 1000,
        kind: "illustration",
        sourceType: "illustration",
        altIt: "int- illustrazione",
        originalFilename: `int-${illustration}.svg`,
      },
      photo(photoOk),
      photo(photoNoAlt, { altIt: null }),
      photo(photoExpired, { heritageAsset: true, authorizationId: authorization }),
      photo(photoActivity),
    ]);
    await tx.insert(areas).values({ id: areaId, slug: slug("area"), nameIt: "Area int", nameEn: "Area int", sort: 990, coverMediaId: illustration });
    const place = (pid: string, name: string, cover: string | null, order: number | null) => ({
      id: pid,
      slug: slug(name),
      name: `int- ${name}`,
      province: "SR",
      lat: 37,
      lng: 15,
      areaId,
      coverMediaId: cover,
      isFeatured: order !== null,
      featuredOrder: order,
    });
    await tx.insert(places).values([
      place(placeOk, "luogo-ok", photoOk, 1),
      place(placeNoAlt, "luogo-senza-alt", photoNoAlt, 2),
      place(placeExpired, "luogo-scaduto", photoExpired, 3),
      place(placeNoPhoto, "luogo-senza-foto", null, null),
    ]);
    await tx.insert(activities).values([
      { id: activityOnPlace, slug: slug("att-luogo"), placeId: placeOk, title: "int- luogo", durationMin: 60, isActive: true },
      { id: activityOwn, slug: slug("att-propria"), placeId: placeOk, title: "int- propria", durationMin: 60, isActive: true, coverMediaId: photoActivity },
      { id: activityOnArea, slug: slug("att-area"), placeId: placeNoPhoto, title: "int- area", durationMin: 60, isActive: true },
    ]);
    await tx.insert(activityInterests).values(
      [activityOnPlace, activityOwn, activityOnArea].map((activityId) => ({ activityId, interestKey: "sea", strength: 2 })),
    );
    await tx.insert(itineraries).values({ id: templateId, title: "int- pronto", slug: slug("pronto"), isTemplate: true, days: 1 });
    await tx.insert(itineraryItems).values([
      { itineraryId: templateId, dayIndex: 0, position: 0, activityId: activityOnArea },
      { itineraryId: templateId, dayIndex: 0, position: 1, activityId: activityOnPlace },
    ]);
  });
});

afterAll(async () => {
  try {
    await dbAdmin.delete(itineraries).where(inArray(itineraries.id, [templateId]));
    await dbAdmin.delete(activities).where(inArray(activities.id, [activityOnPlace, activityOwn, activityOnArea]));
    await dbAdmin.delete(places).where(inArray(places.id, [placeOk, placeNoAlt, placeExpired, placeNoPhoto]));
    await dbAdmin.delete(areas).where(inArray(areas.id, [areaId]));
    await dbAdmin.delete(media).where(inArray(media.id, [illustration, photoOk, photoNoAlt, photoExpired, photoActivity]));
    await dbAdmin.delete(imageAuthorizations).where(inArray(imageAuthorizations.id, [authorization]));
  } finally {
    await closeConnection();
  }
});

describe("catena di ripiego (lettura pubblica)", () => {
  it("luogo: foto propria; con foto bloccata (alt mancante o autorizzazione scaduta) l'illustrazione dell'area", async () => {
    expect((await getPlace(slug("luogo-ok")))?.cover).toMatchObject({ source: "own", media: { id: photoOk, kind: "photo" } });
    expect((await getPlace(slug("luogo-senza-alt")))?.cover).toMatchObject({ source: "area", media: { id: illustration } });
    expect((await getPlace(slug("luogo-scaduto")))?.cover).toMatchObject({ source: "area", media: { id: illustration } });
    expect((await getPlace(slug("luogo-senza-foto")))?.cover).toMatchObject({ source: "area", media: { kind: "illustration" } });
  });

  it("attività: propria → luogo → area", async () => {
    expect((await getActivity(slug("att-propria")))?.cover).toMatchObject({ source: "own", media: { id: photoActivity } });
    expect((await getActivity(slug("att-luogo")))?.cover).toMatchObject({ source: "place", media: { id: photoOk } });
    expect((await getActivity(slug("att-area")))?.cover).toMatchObject({ source: "area", media: { id: illustration } });
  });

  it("itinerario: propria → luogo della prima tappa → area di quel luogo", async () => {
    // La prima tappa è nel luogo senza foto: si passa alla sua area, non alla seconda tappa.
    expect((await getTemplate(slug("pronto")))?.cover).toMatchObject({ source: "area", media: { id: illustration } });
    await dbAdmin.update(places).set({ coverMediaId: photoOk }).where(inArray(places.id, [placeNoPhoto]));
    expect((await getTemplate(slug("pronto")))?.cover).toMatchObject({ source: "first_stop", media: { id: photoOk } });
    await dbAdmin.update(itineraries).set({ coverMediaId: photoActivity }).where(inArray(itineraries.id, [templateId]));
    expect((await getTemplate(slug("pronto")))?.cover).toMatchObject({ source: "own", media: { id: photoActivity } });
    await dbAdmin.update(itineraries).set({ coverMediaId: null }).where(inArray(itineraries.id, [templateId]));
    await dbAdmin.update(places).set({ coverMediaId: null }).where(inArray(places.id, [placeNoPhoto]));
  });

  it("i campi interni non escono: niente source_url né autorizzazioni nella copertina", async () => {
    const cover = (await getPlace(slug("luogo-ok")))?.cover?.media as Record<string, unknown>;
    expect(Object.keys(cover)).not.toContain("sourceUrl");
    expect(Object.keys(cover)).not.toContain("authorizationId");
  });
});

describe("carosello dei luoghi in evidenza", () => {
  it("un luogo con la foto bloccata esce dal carosello, gli altri restano", async () => {
    const featured = (await listFeaturedPlaces()).filter((p) => p.slug.startsWith("int-") && p.slug.endsWith(`-${s}`));
    expect(featured.map((p) => p.slug)).toEqual([slug("luogo-ok")]);
  });
});

describe("controlli di lancio sulle immagini", () => {
  it("segnalano luoghi in evidenza senza foto, beni culturali senza autorizzazione e media pubblici senza alt", async () => {
    const { imageLaunchProblems } = await import("../../../e2e/launch-db.mjs");
    const problems = await imageLaunchProblems(process.env.DATABASE_URL!);
    expect(problems.featuredWithoutPhoto).toEqual(expect.arrayContaining([slug("luogo-senza-alt"), slug("luogo-scaduto")]));
    expect(problems.featuredWithoutPhoto).not.toContain(slug("luogo-ok"));
    expect(problems.heritageWithoutAuthorization).toContain(photoExpired);
    expect(problems.publicMediaWithoutAlt).toContain(photoNoAlt);
    expect(problems.areasWithoutIllustration).not.toContain(slug("area"));
    // Il pronto parte da un luogo senza foto: la catena arriva solo all'illustrazione.
    expect(problems.itinerariesWithoutPhoto).toContain(slug("pronto"));
  });

  it("i dati demo comprendono le immagini demo", async () => {
    const { demoRowCounts } = await import("../../../e2e/launch-db.mjs");
    expect(await demoRowCounts(process.env.DATABASE_URL!)).toHaveProperty("media");
  });
});
