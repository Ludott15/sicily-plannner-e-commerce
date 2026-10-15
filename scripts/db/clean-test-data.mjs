// Elimina dal database locale i dati creati dai test, riconoscibili dal prefisso:
// slug, titoli e testi "int-" (test di integrazione) ed "e2e-" (Playwright) di attività, luoghi,
// itinerari, offerte dei partner, consigli locali (con i loro autori) e immagini (righe e
// file nello storage locale), utenti con email
// int-…@example.com o e2e-…@example.com. Il seed ("demo-") non viene toccato.
//
//   npm run db:clean        pulizia mirata
//   npm run db:reset        database da zero: migrazioni + seed demo
//
// Usato anche prima e dopo le suite di integrazione ed e2e, così i residui di una
// suite interrotta a metà spariscono al giro successivo.

import { config } from "dotenv";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

// "imp-<partner>-int-…": attività create dall'import dei partner nei test (slug derivato dal prodotto).
const TEST_SLUG = ["int-%", "e2e-%", "imp-%-int-%", "imp-%-e2e-%"];
const TEST_EMAIL = ["int-%@example.com", "e2e-%@example.com"];

export async function cleanTestData(sql) {
  return sql.begin(async (tx) => {
    // Consigli e offerte di test, anche attaccati ad attività o luoghi del seed.
    const tips = await tx`delete from public.local_tips where body like any(${TEST_SLUG})`;
    const authors = await tx`delete from public.local_tip_authors where display_name like any(${TEST_SLUG})`;
    const offers = await tx`
      delete from public.activity_offers
      where partner_product_id like any(${TEST_SLUG}) or title like any(${TEST_SLUG})`;
    // Le voci di itinerario bloccano la cancellazione delle attività (on delete restrict).
    const items = await tx`
      delete from public.itinerary_items
      where activity_id in (select id from public.activities where slug like any(${TEST_SLUG}))
         or itinerary_id in (select id from public.itineraries where slug like any(${TEST_SLUG}) or title like any(${TEST_SLUG}))`;
    const itineraries = await tx`
      delete from public.itineraries where slug like any(${TEST_SLUG}) or title like any(${TEST_SLUG})`;
    // I tag si eliminano a cascata con l'attività.
    const activities = await tx`delete from public.activities where slug like any(${TEST_SLUG})`;
    const places = await tx`delete from public.places where slug like any(${TEST_SLUG})`;
    // Immagini caricate dai test (nome file e2e-/int-): righe e file. Le copertine tornano null.
    const testMedia = await tx`
      select id from public.media where original_filename like any(${TEST_SLUG}) or alt_it like any(${TEST_SLUG})`;
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    await tx`
      delete from storage.objects
      where bucket_id = 'media' and split_part(name, '/', 1) = any(${testMedia.map((m) => m.id)}::text[])`;
    const media = await tx`delete from public.media where id = any(${testMedia.map((m) => m.id)}::uuid[])`;
    const areas = await tx`delete from public.areas where slug like any(${TEST_SLUG})`;
    const authorizations = await tx`delete from public.image_authorizations where authority like any(${TEST_SLUG})`;
    const users = await tx`delete from auth.users where email like any(${TEST_EMAIL})`;
    return {
      localTips: tips.count,
      localTipAuthors: authors.count,
      activityOffers: offers.count,
      itineraryItems: items.count,
      itineraries: itineraries.count,
      activities: activities.count,
      places: places.count,
      media: media.count,
      areas: areas.count,
      imageAuthorizations: authorizations.count,
      users: users.count,
    };
  });
}

// Connessione per gli script e le suite di test: DATABASE_URL da .env.local.
export function testDatabase() {
  config({ path: ".env.local", quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL mancante (.env.local)");
  return postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sql = testDatabase();
  try {
    const removed = await cleanTestData(sql);
    console.log("Dati di test eliminati:", removed);
  } finally {
    await sql.end();
  }
}
