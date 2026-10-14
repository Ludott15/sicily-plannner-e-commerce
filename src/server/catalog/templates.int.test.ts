import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublishCheck } from "@/lib/itinerary-checks";
import { NO_TEMPLATE_FILTERS, type TemplateFilters } from "@/lib/template-filters";
import { listTemplateAreas, listTemplates } from "@/server/catalog/queries";
import { dbAdmin } from "@/server/db/admin";
import {
  activities,
  activityInterests,
  areas,
  imageAuthorizations,
  itineraries,
  itineraryItems,
  media,
  places,
} from "@/server/db/schema";
import { DAILY_HOURS } from "@/server/personalization/config";
import { readTemplateForAdmin, templateChecks, unpublishIfChecksFail, type AdminTx } from "./templates.admin";

// Itinerari pronti (1.3) su Postgres locale: controlli di pubblicazione letti dal database,
// fatti e lettura dell'admin, filtri della lista. Tutto ha il prefisso int-: il seed non conta.
// Ogni controllo parte da un itinerario valido e cambia una cosa dentro una transazione che
// si annulla alla fine, così i casi non si disturbano a vicenda.

const s = Date.now();
const tag = `t${s}`;
const id = () => randomUUID();
const slug = (name: string) => `int-tpl-${name}-${tag}`;

const [areaA, areaB] = [id(), id()];
const [p1, p2, p3] = [id(), id(), id()];
const [a1, a2] = [id(), id()];
const [photoOk, photoNoAlt, illustrationId, heritageId] = [id(), id(), id(), id()];
const authId = id();
const [draftId, f1Id, f2Id] = [id(), id(), id()];

const titleA1 = "int- attività uno";
const titleA2 = "int- attività due";

const allPlaceIds = [p1, p2, p3];
const allActivityIds = [a1, a2];
const allMediaIds = [photoOk, photoNoAlt, illustrationId, heritageId];
const allItineraryIds = [draftId, f1Id, f2Id];

const photo = (mediaId: string, altIt: string | null) => ({
  id: mediaId,
  storagePath: `${mediaId}/master.jpg`,
  width: 2000,
  height: 1500,
  kind: "photo" as const,
  sourceType: "own" as const,
  altIt,
  variantsVersion: 1,
  originalFilename: `int-${mediaId}.jpg`,
});

class Rollback extends Error {}

// Esegue la modifica, calcola i controlli del bozza e annulla tutto.
async function checksAfter(mutate: (tx: AdminTx) => PromiseLike<unknown>): Promise<PublishCheck[]> {
  let checks: PublishCheck[] = [];
  await dbAdmin
    .transaction(async (tx) => {
      await mutate(tx);
      checks = await templateChecks(tx, draftId, DAILY_HOURS);
      throw new Rollback("annullata");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  return checks;
}

function byCode(checks: PublishCheck[], code: PublishCheck["code"]): PublishCheck {
  const found = checks.find((check) => check.code === code);
  if (!found) throw new Error(`controllo mancante: ${code}`);
  return found;
}

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(imageAuthorizations).values({
      id: authId,
      authority: "int- soprintendenza",
      reference: `int- ${tag}`,
      issuedOn: "2019-01-01",
      validUntil: "2020-01-01",
      scope: "int- foto",
    });
    await tx.insert(media).values([
      photo(photoOk, "int- foto con testo"),
      photo(photoNoAlt, null),
      {
        id: illustrationId,
        storagePath: `${illustrationId}/illustration.svg`,
        width: 1600,
        height: 1000,
        kind: "illustration",
        sourceType: "illustration",
        altIt: "int- disegno",
        originalFilename: `int-${illustrationId}.svg`,
      },
      // Bene culturale con autorizzazione già scaduta: non è usabile.
      { ...photo(heritageId, "int- bene culturale"), heritageAsset: true, authorizationId: authId },
    ]);
    await tx.insert(areas).values([
      { id: areaA, slug: slug("area-a"), nameIt: "int- area a", nameEn: "int- area a en", sort: 990, coverMediaId: null },
      { id: areaB, slug: slug("area-b"), nameIt: "int- area b", nameEn: "int- area b en", sort: 991, coverMediaId: null },
    ]);
    const place = (placeId: string, name: string, values: Partial<typeof places.$inferInsert>) => ({
      id: placeId,
      slug: slug(name),
      name: `int- ${name}`,
      province: "SR",
      lat: 37,
      lng: 15,
      ...values,
    });
    await tx.insert(places).values([
      place(p1, "luogo-uno", { areaId: areaA, coverMediaId: photoOk }),
      place(p2, "luogo-due", { areaId: areaA }),
      place(p3, "luogo-tre", { areaId: areaB }),
    ]);

    // Le attività nascono inattive: si attivano dopo i tag (trigger activities_require_tags).
    await tx.insert(activities).values([
      {
        id: a1,
        slug: slug("att-uno"),
        placeId: p1,
        title: titleA1,
        durationMin: 120,
        onSitePriceEur: "10.00",
        seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        isActive: false,
      },
      {
        id: a2,
        slug: slug("att-due"),
        placeId: p2,
        title: titleA2,
        durationMin: 200,
        seasonMonths: [6, 7, 8, 9],
        isActive: false,
      },
    ]);
    await tx.insert(activityInterests).values([
      { activityId: a1, interestKey: "sea", strength: 2 },
      { activityId: a2, interestKey: "sea", strength: 2 },
    ]);
    await tx.update(activities).set({ isActive: true }).where(inArray(activities.id, allActivityIds));

    // Bozza di controllo: due giorni, ritmo bilanciato (360 minuti), senza slug (non pubblicata).
    await tx.insert(itineraries).values({
      id: draftId,
      title: "int- bozza controlli",
      slug: null,
      isTemplate: true,
      days: 2,
      pace: "balanced",
      status: "planned",
    });
    await tx.insert(itineraryItems).values([
      { itineraryId: draftId, dayIndex: 0, position: 0, activityId: a1 },
      { itineraryId: draftId, dayIndex: 0, position: 1, activityId: a2 },
      { itineraryId: draftId, dayIndex: 1, position: 0, placeId: p2 },
    ]);

    // Due itinerari pubblicati per i filtri, con luoghi in due aree diverse.
    await tx.insert(itineraries).values([
      {
        id: f1Id,
        title: "int- filtri uno",
        slug: slug("filtri-uno"),
        isTemplate: true,
        days: 2,
        suitableFor: ["couple"],
        seasonMonths: [5, 6],
        status: "planned",
      },
      {
        id: f2Id,
        title: "int- filtri due",
        slug: slug("filtri-due"),
        isTemplate: true,
        days: 5,
        suitableFor: ["family"],
        status: "planned",
      },
    ]);
    await tx.insert(itineraryItems).values([
      { itineraryId: f1Id, dayIndex: 0, position: 0, placeId: p1 },
      { itineraryId: f1Id, dayIndex: 1, position: 0, placeId: p2 },
      { itineraryId: f2Id, dayIndex: 0, position: 0, placeId: p3 },
    ]);
  });
});

afterAll(async () => {
  await dbAdmin.delete(itineraries).where(inArray(itineraries.id, allItineraryIds));
  await dbAdmin.delete(activities).where(inArray(activities.id, allActivityIds));
  await dbAdmin.delete(places).where(inArray(places.id, allPlaceIds));
  await dbAdmin.delete(areas).where(inArray(areas.id, [areaA, areaB]));
  await dbAdmin.delete(media).where(inArray(media.id, allMediaIds));
  await dbAdmin.delete(imageAuthorizations).where(eq(imageAuthorizations.id, authId));
});

describe("controlli di pubblicazione letti dal database", () => {
  it("un itinerario completo passa tutti i controlli", async () => {
    const checks = await dbAdmin.transaction((tx) => templateChecks(tx, draftId, DAILY_HOURS));
    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(checks).toHaveLength(7);
  });

  it("senza ritmo: pace_missing", async () => {
    const checks = await checksAfter((tx) => tx.update(itineraries).set({ pace: null }).where(eq(itineraries.id, draftId)));
    expect(byCode(checks, "pace_missing").ok).toBe(false);
    expect(byCode(checks, "day_too_long").ok).toBe(true);
  });

  it("un giorno senza tappe: day_without_stops con il giorno da 1", async () => {
    const checks = await checksAfter((tx) =>
      tx
        .delete(itineraryItems)
        .where(and(eq(itineraryItems.itineraryId, draftId), eq(itineraryItems.dayIndex, 1)))
    );
    expect(byCode(checks, "day_without_stops")).toEqual({ code: "day_without_stops", ok: false, details: [{ day: 2 }] });
  });

  it("un'attività disattivata: inactive_activity", async () => {
    const checks = await checksAfter((tx) =>
      tx.update(activities).set({ isActive: false }).where(eq(activities.id, a2)),
    );
    expect(byCode(checks, "inactive_activity").details).toEqual([{ day: 1, activity: titleA2 }]);
  });

  it("un giorno più lungo del ritmo: day_too_long con minuti e limite", async () => {
    const checks = await checksAfter((tx) =>
      tx.update(activities).set({ durationMin: 300 }).where(eq(activities.id, a2)),
    );
    expect(byCode(checks, "day_too_long").details).toEqual([{ day: 1, minutes: 420, limit: 360 }]);
  });

  it("un'attività che non copre i mesi consigliati: out_of_season", async () => {
    const checks = await checksAfter((tx) =>
      tx.update(itineraries).set({ seasonMonths: [5, 6] }).where(eq(itineraries.id, draftId)),
    );
    expect(byCode(checks, "out_of_season").details).toEqual([{ day: 1, activity: titleA2 }]);
  });

  it("copertina con foto senza testo alternativo: cover_alt_missing", async () => {
    const checks = await checksAfter((tx) =>
      tx.update(places).set({ coverMediaId: photoNoAlt }).where(eq(places.id, p1)),
    );
    expect(byCode(checks, "cover_alt_missing").ok).toBe(false);
    expect(byCode(checks, "cover_missing").ok).toBe(true);
  });

  it("un'illustrazione o un bene culturale con autorizzazione scaduta non sono copertina", async () => {
    const withIllustration = await checksAfter((tx) =>
      tx.update(places).set({ coverMediaId: illustrationId }).where(eq(places.id, p1)),
    );
    expect(byCode(withIllustration, "cover_missing").ok).toBe(false);

    const withExpired = await checksAfter((tx) =>
      tx.update(places).set({ coverMediaId: heritageId }).where(eq(places.id, p1)),
    );
    expect(byCode(withExpired, "cover_missing").ok).toBe(false);
  });

  it("la copertina propria dell'itinerario vince sulla prima tappa", async () => {
    const checks = await checksAfter(async (tx) => {
      await tx.update(places).set({ coverMediaId: null }).where(eq(places.id, p1));
      await tx.update(itineraries).set({ coverMediaId: photoOk }).where(eq(itineraries.id, draftId));
    });
    expect(byCode(checks, "cover_missing").ok).toBe(true);
  });
});

describe("lettura per l'admin", () => {
  it("restituisce tappe, controlli e fatti; un id che non è un template dà null", async () => {
    await dbAdmin.transaction(async (tx) => {
      const template = await readTemplateForAdmin(tx, draftId, DAILY_HOURS);
      expect(template?.items).toHaveLength(3);
      expect(template?.checks.every((check) => check.ok)).toBe(true);
      // Budget: 10 € (la prima attività) diviso 2 giorni = 5 €; nessuna auto; un'area sola.
      expect(template?.facts).toEqual({
        budgetPerDayEur: 5,
        requiresCar: false,
        areas: [{ id: areaA, nameIt: "int- area a", nameEn: "int- area a en" }],
      });
      expect(await readTemplateForAdmin(tx, randomUUID(), DAILY_HOURS)).toBeNull();
    });
  });
});

describe("lista degli itinerari pronti con i filtri", () => {
  // Solo gli itinerari di questa esecuzione: la lista contiene anche il seed.
  const mine = async (filters: Partial<TemplateFilters> = {}) =>
    (await listTemplates({ ...NO_TEMPLATE_FILTERS, ...filters }))
      .map((template) => template.slug)
      .filter((value) => value.endsWith(tag));

  it("senza filtri elenca i pubblicati e non la bozza", async () => {
    expect((await mine()).sort()).toEqual([slug("filtri-due"), slug("filtri-uno")].sort());
  });

  it("gruppi di giorni: 2-3 prende il primo, 4-5 il secondo, 8+ nessuno", async () => {
    expect(await mine({ days: ["2-3"] })).toEqual([slug("filtri-uno")]);
    expect(await mine({ days: ["4-5"] })).toEqual([slug("filtri-due")]);
    expect(await mine({ days: ["8+"] })).toEqual([]);
  });

  it("area: solo gli itinerari che passano dai suoi luoghi", async () => {
    expect(await mine({ area: slug("area-b") })).toEqual([slug("filtri-due")]);
    expect(await mine({ area: slug("area-a") })).toEqual([slug("filtri-uno")]);
  });

  it("per: solo chi è adatto a quel gruppo", async () => {
    expect(await mine({ party: "family" })).toEqual([slug("filtri-due")]);
    expect(await mine({ party: "couple" })).toEqual([slug("filtri-uno")]);
  });

  it("mese: un itinerario con mesi consigliati vale solo in quei mesi; senza mesi vale sempre", async () => {
    expect(await mine({ month: 7 })).toEqual([slug("filtri-due")]);
    expect((await mine({ month: 5 })).sort()).toEqual([slug("filtri-due"), slug("filtri-uno")].sort());
  });

  it("filtri combinati", async () => {
    expect(await mine({ days: ["2-3"], party: "couple" })).toEqual([slug("filtri-uno")]);
    expect(await mine({ days: ["2-3"], party: "family" })).toEqual([]);
  });

  it("le aree delle opzioni: solo quelle toccate dagli itinerari pubblicati, con i nomi", async () => {
    const options = (await listTemplateAreas()).filter((area) => area.slug.endsWith(tag));
    expect(options).toEqual([
      expect.objectContaining({ slug: slug("area-a"), nameIt: "int- area a", nameEn: "int- area a en" }),
      expect.objectContaining({ slug: slug("area-b"), nameIt: "int- area b", nameEn: "int- area b en" }),
    ]);
  });
});

// Esegue la verifica dentro una transazione che si annulla alla fine.
async function inRolledBackTx(check: (tx: AdminTx) => Promise<void>) {
  await dbAdmin
    .transaction(async (tx) => {
      await check(tx);
      throw new Rollback("annullata");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

describe("ritiro della pubblicazione quando i controlli non passano", () => {
  it("un template pubblicato che perde una tappa esce dalle pagine pubbliche (slug null)", async () => {
    await inRolledBackTx(async (tx) => {
      await tx.update(itineraries).set({ slug: slug("pubblicato") }).where(eq(itineraries.id, draftId));
      // Il caso parte da un itinerario che passa i controlli: il ritiro dipende solo dalla tappa tolta.
      expect((await templateChecks(tx, draftId, DAILY_HOURS)).every((check) => check.ok)).toBe(true);
      await tx
        .delete(itineraryItems)
        .where(and(eq(itineraryItems.itineraryId, draftId), eq(itineraryItems.dayIndex, 1)));
      await unpublishIfChecksFail(tx, draftId, DAILY_HOURS);
      const [row] = await tx.select({ slug: itineraries.slug }).from(itineraries).where(eq(itineraries.id, draftId));
      expect(row?.slug).toBeNull();
    });
  });

  it("un template pubblicato che passa ancora i controlli resta pubblicato", async () => {
    await inRolledBackTx(async (tx) => {
      await tx.update(itineraries).set({ slug: slug("pubblicato-ok") }).where(eq(itineraries.id, draftId));
      await unpublishIfChecksFail(tx, draftId, DAILY_HOURS);
      const [row] = await tx.select({ slug: itineraries.slug }).from(itineraries).where(eq(itineraries.id, draftId));
      expect(row?.slug).toBe(slug("pubblicato-ok"));
    });
  });
});
