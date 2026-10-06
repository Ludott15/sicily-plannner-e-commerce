"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AdminErrorCode, AdminFormState } from "@/lib/admin-form";
import { routing } from "@/lib/i18n/routing";
import { PROVINCES } from "@/lib/provinces";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, activityOffers, adminAuditLog, itineraries, itineraryItems, places } from "@/server/db/schema";

// Azioni dell'admin del catalogo: Zod → requireAdmin → scrittura con dbAdmin in transazione.
// Ogni cambio di stato di un'attività (attivazione, disattivazione) aggiunge una riga
// ad admin_audit_log. La regola "niente attivazione senza tag" la controlla anche il
// database (trigger activities_require_tags): qui si dà un messaggio chiaro prima.


const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));
const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .pipe(z.number().nonnegative().nullable());
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

function dbErrorCode(error: unknown): AdminErrorCode {
  const cause = (error as { cause?: { code?: string; message?: string; constraint_name?: string } })?.cause ?? error;
  const { code, message, constraint_name: constraint } = cause as {
    code?: string;
    message?: string;
    constraint_name?: string;
  };
  if (message === "activity_without_tags") return "activity_without_tags";
  if (code === "23505") return constraint?.includes("partner_product") ? "partner_product_taken" : "slug_taken";
  if (code === "23514" && constraint?.includes("day_titles")) return "day_titles_exceed_days";
  return "failed";
}

// ---------------------------------------------------------------------------
// Attività
// ---------------------------------------------------------------------------

const activitySchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  title: z.string().trim().min(3).max(200),
  slug: slugSchema,
  placeId: z.uuid(),
  description: optionalText,
  durationMin: z.coerce.number().int().positive().max(24 * 60),
  onSitePriceEur: optionalNumber,
  requiresCar: checkbox,
  accessible: checkbox,
  rating: optionalNumber.pipe(z.number().max(5).nullable()),
  isActive: checkbox,
});

function readActivityForm(formData: FormData) {
  const months = formData.getAll("seasonMonths").map(Number);
  const diets = new Set(["vegetarian", "vegan", "gluten_free", "lactose_free"]);
  const dietFriendly = [...new Set(formData.getAll("dietFriendly").map(String))].filter((d) => diets.has(d)).sort();
  const tags = [...formData.entries()]
    .filter(([key]) => key.startsWith("tag_"))
    .map(([key, value]) => ({ key: key.slice(4), strength: Number(value) }))
    .filter((t) => t.strength >= 1 && t.strength <= 3);
  return { months, tags, dietFriendly };
}

export async function saveActivity(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  const { months, tags, dietFriendly } = readActivityForm(formData);
  if (!parsed.success || months.some((m) => !Number.isInteger(m) || m < 1 || m > 12) || months.length === 0) {
    return { status: "error", code: "invalid" };
  }
  const { user } = await requireAdmin();
  const { id, locale, isActive, ...fields } = parsed.data;
  if (isActive && tags.length === 0) return { status: "error", code: "activity_without_tags" };

  let savedId: string;
  try {
    savedId = await dbAdmin.transaction(async (tx) => {
      const values = {
        ...fields,
        onSitePriceEur: fields.onSitePriceEur === null ? null : fields.onSitePriceEur.toFixed(2),
        rating: fields.rating === null ? null : fields.rating.toFixed(1),
        seasonMonths: [...new Set(months)].sort((a, b) => a - b),
        dietFriendly,
        isActive,
      };
      let previous: boolean | null = null;
      let activityId: string;
      if (id) {
        const [row] = await tx.select({ isActive: activities.isActive }).from(activities).where(eq(activities.id, id));
        if (!row) throw new Error("not_found");
        previous = row.isActive;
        await tx.update(activities).set(values).where(eq(activities.id, id));
        activityId = id;
      } else {
        const [row] = await tx.insert(activities).values(values).returning({ id: activities.id });
        activityId = row!.id;
      }

      await tx.delete(activityInterests).where(eq(activityInterests.activityId, activityId));
      if (tags.length > 0) {
        await tx
          .insert(activityInterests)
          .values(tags.map((t) => ({ activityId, interestKey: t.key, strength: t.strength })));
      }

      if (previous !== isActive && (previous !== null || isActive)) {
        await tx.insert(adminAuditLog).values({
          actorId: user.id,
          action: isActive ? "activity.activate" : "activity.deactivate",
          entity: "activities",
          entityId: activityId,
          diff: { is_active: [previous, isActive], tags: tags.map((t) => t.key) },
        });
      }
      return activityId;
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/attivita/${savedId}?salvata=1`);
}

// ---------------------------------------------------------------------------
// Luoghi
// ---------------------------------------------------------------------------

const placeSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  province: z.enum(Object.keys(PROVINCES) as [string, ...string[]]),
  // Area di viaggio; vuota = non ancora assegnata.
  areaId: z.uuid().nullable().or(z.literal("").transform(() => null)),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  description: optionalText,
});

export async function savePlace(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, locale, ...values } = parsed.data;

  let savedId: string;
  try {
    if (id) {
      await dbAdmin.update(places).set(values).where(eq(places.id, id));
      savedId = id;
    } else {
      const [row] = await dbAdmin.insert(places).values(values).returning({ id: places.id });
      savedId = row!.id;
    }
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/luoghi/${savedId}?salvato=1`);
}

// ---------------------------------------------------------------------------
// Itinerari pronti (template editoriali: owner_id null, is_template true)
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  title: z.string().trim().min(3).max(200),
  // Vuoto = non pubblicato: gli itinerari pronti compaiono nelle pagine pubbliche solo con uno slug.
  slug: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(slugSchema.nullable()),
  days: z.coerce.number().int().min(1).max(60),
});

export async function saveTemplate(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, locale, ...fields } = parsed.data;

  // Titoli dei giorni: uno per giorno; gli ultimi vuoti si tolgono, quelli in mezzo restano "".
  const dayTitles = Array.from({ length: fields.days }, (_, i) =>
    String(formData.get(`dayTitle_${i}`) ?? "").trim().slice(0, 80),
  );
  while (dayTitles.length > 0 && dayTitles.at(-1) === "") dayTitles.pop();

  let savedId: string;
  try {
    if (id) {
      await dbAdmin
        .update(itineraries)
        .set({ ...fields, dayTitles })
        .where(and(eq(itineraries.id, id), eq(itineraries.isTemplate, true)));
      savedId = id;
    } else {
      const [row] = await dbAdmin
        .insert(itineraries)
        .values({ ...fields, dayTitles, ownerId: null, isTemplate: true, status: "planned" })
        .returning({ id: itineraries.id });
      savedId = row!.id;
    }
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/itinerari/${savedId}?salvato=1`);
}

const itemSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  dayIndex: z.coerce.number().int().min(0).max(59),
  activityId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  customTitle: optionalText.optional(),
  startTime: z
    .string()
    .trim()
    .regex(/^(\d{1,2}:\d{2})?$/)
    .transform((v) => (v === "" ? null : v)),
});

export async function addTemplateItem(formData: FormData) {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || (!parsed.data.activityId && !parsed.data.customTitle)) return;
  await requireAdmin();
  const { locale, templateId, dayIndex, activityId, customTitle, startTime } = parsed.data;

  await dbAdmin.transaction(async (tx) => {
    const [{ next }] = (await tx.execute<{ next: number }>(
      sql`select coalesce(max(position) + 1, 0)::int as next from public.itinerary_items where itinerary_id = ${templateId} and day_index = ${dayIndex}`,
    )) as unknown as [{ next: number }];
    await tx.insert(itineraryItems).values({
      itineraryId: templateId,
      dayIndex,
      position: next,
      activityId: activityId ?? null,
      customTitle: activityId ? null : (customTitle ?? null),
      startTime,
    });
  });
  redirect(`/${locale}/admin/itinerari/${templateId}#giorno-${dayIndex + 1}`);
}

const itemRefSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  itemId: z.uuid(),
  direction: z.enum(["up", "down"]).optional(),
});

export async function deleteTemplateItem(formData: FormData) {
  const parsed = itemRefSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireAdmin();
  const { locale, templateId, itemId } = parsed.data;
  await dbAdmin
    .delete(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, templateId)));
  redirect(`/${locale}/admin/itinerari/${templateId}`);
}

// Sposta una tappa di un posto nello stesso giorno, scambiando la posizione con la vicina.
export async function moveTemplateItem(formData: FormData) {
  const parsed = itemRefSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !parsed.data.direction) return;
  await requireAdmin();
  const { locale, templateId, itemId, direction } = parsed.data;

  await dbAdmin.transaction(async (tx) => {
    const [item] = await tx.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
    if (!item || item.itineraryId !== templateId) return;
    const day = await tx
      .select({ id: itineraryItems.id, position: itineraryItems.position })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.itineraryId, templateId), eq(itineraryItems.dayIndex, item.dayIndex)))
      .orderBy(asc(itineraryItems.position));
    const index = day.findIndex((d) => d.id === itemId);
    const other = day[direction === "up" ? index - 1 : index + 1];
    if (!other) return;
    await tx.update(itineraryItems).set({ position: other.position }).where(eq(itineraryItems.id, itemId));
    await tx.update(itineraryItems).set({ position: item.position }).where(eq(itineraryItems.id, other.id));
  });
  redirect(`/${locale}/admin/itinerari/${templateId}`);
}

// ---------------------------------------------------------------------------
// Offerte dei partner di un'attività (activity_offers)
// ---------------------------------------------------------------------------

const OFFER_PARTNERS = ["getyourguide", "viator", "travelpayouts", "car_rental"] as const;

const offerSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  activityId: z.uuid(),
  locale: localeSchema,
  partner: z.enum(OFFER_PARTNERS),
  partnerProductId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(3).max(200),
  priceFromEur: optionalNumber,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  affiliateUrl: z.url({ protocol: /^https$/ }).max(2048),
  rating: optionalNumber.pipe(z.number().max(5).nullable()),
  reviewsCount: optionalNumber.pipe(z.number().int().nullable()),
  freeCancellation: z.enum(["", "yes", "no"]).transform((v) => (v === "" ? null : v === "yes")),
  isActive: checkbox,
});

// La data del prezzo cambia solo quando cambia il prezzo: è quella mostrata nell'offerta.
export async function saveOffer(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = offerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, activityId, locale, priceFromEur, rating, ...fields } = parsed.data;
  const price = priceFromEur === null ? null : priceFromEur.toFixed(2);

  try {
    await dbAdmin.transaction(async (tx) => {
      const values = { ...fields, activityId, priceFromEur: price, rating: rating === null ? null : rating.toFixed(1) };
      if (id) {
        const [row] = await tx
          .select({ price: activityOffers.priceFromEur })
          .from(activityOffers)
          .where(and(eq(activityOffers.id, id), eq(activityOffers.activityId, activityId)));
        if (!row) throw new Error("not_found");
        await tx
          .update(activityOffers)
          .set({ ...values, ...(row.price !== price && { priceUpdatedAt: price === null ? null : new Date() }) })
          .where(eq(activityOffers.id, id));
      } else {
        await tx.insert(activityOffers).values({ ...values, priceUpdatedAt: price === null ? null : new Date() });
      }
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/attivita/${activityId}?offerta=salvata#offerte`);
}

const deleteOfferSchema = z.object({ id: z.uuid(), activityId: z.uuid(), locale: localeSchema });

export async function deleteOffer(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = deleteOfferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, activityId, locale } = parsed.data;
  await dbAdmin
    .delete(activityOffers)
    .where(and(eq(activityOffers.id, id), eq(activityOffers.activityId, activityId)));
  redirect(`/${locale}/admin/attivita/${activityId}?offerta=eliminata#offerte`);
}
