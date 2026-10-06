// Immagini demo per sviluppo locale, CI ed e2e: file generati qui (tinta unita con il nome),
// mai foto vere né immagini generate da modelli. Nome file e testo alternativo hanno il
// prefisso "demo-" / "[DEMO]": il controllo di lancio sui dati demo (e2e/launch-db.mjs) li
// blocca in produzione, e lo script rifiuta di girare fuori da Supabase locale.
//
//   npm run media:demo     dopo npm run db:reset (il seed non può caricare file nello storage)
//
// Cosa crea:
// - una foto per i luoghi demo, tranne alcuni lasciati senza (per vedere il ripiego sull'area);
// - un'illustrazione SVG per ognuna delle otto aree;
// - la copertina propria di un'attività e di un itinerario pronto.
// Le varianti seguono le stesse regole di src/server/media (ritaglio 4:5, 16:9, 1:1 sul
// punto focale, AVIF e WebP), importate da src/lib/media.ts.

import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import sharp from "sharp";
import { RATIO_KEYS, cropRect, variantPath, variantWidths } from "../../src/lib/media.ts";

config({ path: ".env.local", quiet: true });
const { NEXT_PUBLIC_SUPABASE_URL: apiUrl, SUPABASE_SECRET_KEY: secret, DATABASE_URL: dbUrl } = process.env;
if (!apiUrl || !secret || !dbUrl) throw new Error("Servono NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY e DATABASE_URL (.env.local)");
const host = new URL(apiUrl).hostname;
if (!["127.0.0.1", "localhost"].includes(host) || !/@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl)) {
  throw new Error("Le immagini demo si caricano solo su Supabase locale.");
}

// Luoghi senza foto propria: mostrano l'illustrazione dell'area (ripiego).
const WITHOUT_PHOTO = new Set(["demo-bronte", "demo-polizzi", "demo-aidone", "demo-sciacca"]);
const ACTIVITY_COVER = "demo-crateri-etna";
const ITINERARY_COVER = "demo-weekend-palermo";

// Tinte calde e distinte, solo per riconoscere a colpo d'occhio le immagini di prova.
const hue = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function photoSvg(name, width, height) {
  const h = hue(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="hsl(${h}, 45%, 58%)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.round(width / 14)}" fill="hsl(${h}, 40%, 18%)">${escape(name)}</text>
  <text x="50%" y="62%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width / 40)}" fill="hsl(${h}, 40%, 22%)">immagine di prova</text>
</svg>`;
}

function illustrationSvg(name) {
  const h = hue(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="hsl(${h}, 35%, 82%)"/>
  <path d="M0 760 Q 400 620 800 720 T 1600 680 V 1000 H 0 Z" fill="hsl(${h}, 35%, 64%)"/>
  <text x="800" y="460" text-anchor="middle" font-family="sans-serif" font-size="96" fill="hsl(${h}, 40%, 20%)">${escape(name)}</text>
</svg>`;
}

async function upload(path, body, contentType) {
  const res = await fetch(`${apiUrl}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": contentType, "x-upsert": "true" },
    body,
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
}

async function removePrefix(prefixes) {
  if (prefixes.length === 0) return;
  for (const prefix of prefixes) {
    const list = await fetch(`${apiUrl}/storage/v1/object/list/media`, {
      method: "POST",
      headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000 }),
    }).then((r) => r.json());
    const names = [];
    for (const item of list) {
      if (item.id) names.push(`${prefix}/${item.name}`);
      else {
        const sub = await fetch(`${apiUrl}/storage/v1/object/list/media`, {
          method: "POST",
          headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
          body: JSON.stringify({ prefix: `${prefix}/${item.name}`, limit: 1000 }),
        }).then((r) => r.json());
        names.push(...sub.map((s) => `${prefix}/${item.name}/${s.name}`));
      }
    }
    if (names.length === 0) continue;
    await fetch(`${apiUrl}/storage/v1/object/media`, {
      method: "DELETE",
      headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: names }),
    });
  }
}

async function createPhoto(sql, name, filename) {
  const width = 2400;
  const height = 1600;
  const master = await sharp(Buffer.from(photoSvg(name, width, height))).jpeg({ quality: 82 }).toBuffer();
  const id = randomUUID();
  await upload(`${id}/master.jpg`, master, "image/jpeg");
  for (const ratio of RATIO_KEYS) {
    const rect = cropRect(width, height, ratio, 0.5, 0.5);
    for (const w of variantWidths(rect.width)) {
      const resized = sharp(master).extract(rect).resize({ width: w });
      await upload(variantPath(id, 1, ratio, w, "avif"), await resized.clone().avif({ quality: 50, effort: 2 }).toBuffer(), "image/avif");
      await upload(variantPath(id, 1, ratio, w, "webp"), await resized.clone().webp({ quality: 75 }).toBuffer(), "image/webp");
    }
  }
  const blur = await sharp(master).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  await sql`
    insert into public.media (id, storage_path, width, height, alt_it, alt_en, kind, source_type, author, license,
                              modified, blur_data_url, variants_version, original_filename)
    values (${id}, ${`${id}/master.jpg`}, ${width}, ${height}, ${`[DEMO] Immagine di prova: ${name}`},
            ${`[DEMO] Test image: ${name}`}, 'photo', 'own', 'Immagine di prova', 'Solo sviluppo', false,
            ${`data:image/webp;base64,${blur.toString("base64")}`}, 1, ${filename})`;
  return id;
}

async function createIllustration(sql, name, filename) {
  const id = randomUUID();
  await upload(`${id}/illustration.svg`, Buffer.from(illustrationSvg(name)), "image/svg+xml");
  await sql`
    insert into public.media (id, storage_path, width, height, alt_it, alt_en, kind, source_type, original_filename)
    values (${id}, ${`${id}/illustration.svg`}, 1600, 1000, ${`[DEMO] Illustrazione di prova: ${name}`},
            ${`[DEMO] Test illustration: ${name}`}, 'illustration', 'illustration', ${filename})`;
  return id;
}

const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });
try {
  // Idempotente: via le immagini demo precedenti (righe e file).
  const old = await sql`select id from public.media where original_filename like 'demo-%'`;
  await removePrefix(old.map((r) => r.id));
  await sql`delete from public.media where original_filename like 'demo-%'`;

  const areas = await sql`select id, slug, name_it from public.areas order by sort`;
  for (const area of areas) {
    const mediaId = await createIllustration(sql, area.name_it, `demo-${area.slug}-01.svg`);
    await sql`update public.areas set cover_media_id = ${mediaId} where id = ${area.id}`;
  }

  const places = await sql`select id, slug, name from public.places where slug like 'demo-%' order by slug`;
  let photos = 0;
  for (const place of places) {
    if (WITHOUT_PHOTO.has(place.slug)) continue;
    const mediaId = await createPhoto(sql, place.name, `${place.slug}-01.jpg`);
    await sql`update public.places set cover_media_id = ${mediaId} where id = ${place.id}`;
    photos++;
  }

  const [activity] = await sql`select id, title from public.activities where slug = ${ACTIVITY_COVER}`;
  if (activity) {
    const mediaId = await createPhoto(sql, activity.title.replace(/^\[DEMO\]\s*/, ""), `${ACTIVITY_COVER}-01.jpg`);
    await sql`update public.activities set cover_media_id = ${mediaId} where id = ${activity.id}`;
    photos++;
  }
  const [itinerary] = await sql`select id, title from public.itineraries where slug = ${ITINERARY_COVER}`;
  if (itinerary) {
    const mediaId = await createPhoto(sql, itinerary.title.replace(/^\[DEMO\]\s*/, ""), `${ITINERARY_COVER}-01.jpg`);
    await sql`update public.itineraries set cover_media_id = ${mediaId} where id = ${itinerary.id}`;
    photos++;
  }
  console.log(`Immagini demo: ${photos} foto, ${areas.length} illustrazioni di area.`);
} finally {
  await sql.end();
}
