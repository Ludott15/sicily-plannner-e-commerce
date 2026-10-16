// Service worker di Isula (passo 11.3). Scritto a mano, senza librerie.
//
// Cosa fa, in breve:
// - File statici (/_next/static, /icons, font): prima la cache, poi la rete.
// - Pagine di un viaggio e lista "I miei viaggi": prima la rete (con tempo massimo), poi l'ultima copia
//   salvata. Le copie appartengono alla sessione che le ha aperte: il client comunica al service worker
//   un identificatore opaco della sessione (un hash, mai l'id utente), a ogni cambio di pagina. Se la
//   sessione cambia, le pagine dei viaggi escono dalla cache. Senza sessione ("anon") non si salva
//   nessuna pagina di viaggio. Gli ospiti (sessione anonima di Supabase) hanno un id e i loro viaggi
//   si salvano come quelli di un account: anche un ospite in viaggio deve ritrovare l'itinerario.
//   Limite noto: la prima apertura di un viaggio può arrivare prima che il client comunichi la sessione
//   e non si salva; dalla visita successiva sì.
// - Altre pagine: solo rete; senza rete, la pagina "Sei offline".
// - Mai in cache: /api, l'area admin, le richieste diverse da GET, le risposte diverse da 200 e quelle
//   reindirizzate (una pagina di accesso non deve prendere il posto di un viaggio).
//
// VERSION: va alzata a mano quando cambia questo file (il build non lo scrive qui). Alla attivazione le
// cache delle versioni precedenti si cancellano.

const VERSION = "v1";
const STATIC_CACHE = `isula-static-${VERSION}`;
// Pagine con dati dell'utente: si svuotano quando cambia la sessione.
const PAGES_CACHE = `isula-pages-${VERSION}`;
// Piccola memoria del service worker: l'identificatore della sessione corrente. Sta in una cache perché
// il service worker può essere fermato e riavviato in qualsiasi momento.
const META_CACHE = `isula-meta-${VERSION}`;
const SESSION_URL = `${self.location.origin}/__isula/session`;
const ANONYMOUS = "anon";
const MAX_TRIPS = 5;
const NETWORK_TIMEOUT_MS = 4000;
const OFFLINE_FETCH_TIMEOUT_MS = 4000;
const LOCALES = ["it", "en"];
const DEFAULT_LOCALE = "it";

const TRIP_DETAIL = /^\/(it|en)\/viaggi\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIP_LIST = /^\/(it|en)\/viaggi\/?$/;
const NEVER_CACHED = /^\/(it|en)\/admin(\/|$)|^\/api\//;
const STATIC_PATH = /^\/_next\/static\/|^\/icons\/|\.woff2?$/;

// Pagina di ripiego se anche la copia di "Sei offline" manca (prima installazione senza rete).
const FALLBACK_HTML =
  '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Isula</title><body><h1>Sei offline</h1><p>Riprova quando torni online.</p></body></html>";

// All'installazione salva le pagine "Sei offline" di entrambe le lingue. Le richieste partono senza
// cookie (credentials: omit): la copia non contiene il nome di nessun utente.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      for (const locale of LOCALES) {
        try {
          const response = await fetchWithTimeout(`/${locale}/offline`, OFFLINE_FETCH_TIMEOUT_MS, {
            credentials: "omit",
            cache: "no-cache",
          });
          if (response.status === 200) await cache.put(`/${locale}/offline`, response);
        } catch {
          // Senza rete all'installazione la pagina arriverà dal ripiego inline.
        }
      }
      await self.skipWaiting();
    })(),
  );
});

// Alla attivazione si cancellano le cache delle versioni precedenti e si prendono subito le schede aperte.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const current = [STATIC_CACHE, PAGES_CACHE, META_CACHE];
      await Promise.all(names.filter((name) => !current.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Messaggi dalla pagina: a ogni cambio di pagina il client dice quale sessione è attiva.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "session" || typeof data.id !== "string" || data.id.length > 128) return;
  event.waitUntil(setSession(data.id));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHED.test(url.pathname)) return;

  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    if (TRIP_DETAIL.test(url.pathname) || TRIP_LIST.test(url.pathname)) {
      event.respondWith(networkFirstPage(request, url));
    } else {
      event.respondWith(networkOrOfflinePage(request, url));
    }
  }
});

// Identificatore della sessione: lo scrive il client; "anon" o assente vuol dire nessun utente.
async function readSession() {
  const meta = await caches.open(META_CACHE);
  const hit = await meta.match(SESSION_URL);
  return hit ? hit.text() : null;
}

// Se la sessione cambia (altro utente, o uscita), le pagine dei viaggi del precedente utente escono.
async function setSession(id) {
  const previous = await readSession();
  if (previous !== id) await caches.delete(PAGES_CACHE);
  const meta = await caches.open(META_CACHE);
  await meta.put(SESSION_URL, new Response(id));
}

// Cache prima, poi rete. Si salvano solo risposte valide dello stesso sito. Errore: risposta di rete fallita.
async function cacheFirst(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.status === 200 && response.type === "basic" && !response.headers.get("Cache-Control")?.includes("no-store")) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

// Rete con tempo massimo; se va male si usa l'ultima copia della pagina, poi la pagina offline.
// Una risposta reindirizzata (per esempio alla pagina di accesso) non si salva mai.
async function networkFirstPage(request, url) {
  try {
    const response = await fetchWithTimeout(request, undefined, NETWORK_TIMEOUT_MS);
    if (response.status === 200 && response.type === "basic" && !response.redirected) {
      try {
        await savePage(url, response.clone());
      } catch {
        // Cache piena o non disponibile: la pagina arriva lo stesso, senza copia.
      }
    }
    return response;
  } catch {
    return (await matchPage(url)) ?? (await offlinePage(localeOf(url.pathname)));
  }
}

// Solo rete; senza rete la pagina "Sei offline". Le risposte non si salvano.
async function networkOrOfflinePage(request, url) {
  try {
    return await fetch(request);
  } catch {
    return offlinePage(localeOf(url.pathname));
  }
}

// fetch con tempo massimo: scaduto il tempo la richiesta si annulla e si lancia un errore. Con
// ms non definito il fetch non ha limiti.
async function fetchWithTimeout(input, init, ms) {
  const controller = new AbortController();
  const timer = ms === undefined ? null : setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

// La copia si salva due volte: sotto l'URL senza query (per /viaggi/<id>) e sotto l'URL completo
// (per /viaggi/<id>?scheda=...). Senza sessione ("anon" o ancora sconosciuta) non si salva nulla.
async function savePage(url, response) {
  const session = await readSession();
  if (session === null || session === ANONYMOUS) return;

  const cache = await caches.open(PAGES_CACHE);
  const isTrip = TRIP_DETAIL.test(url.pathname);
  if (isTrip) await forgetTrip(cache, url.pathname);
  await cache.put(new Request(pageKey(url)), response.clone());
  await cache.put(new Request(url.href), response);
  if (isTrip) await keepRecentTrips(cache);
}

async function matchPage(url) {
  const cache = await caches.open(PAGES_CACHE);
  return (await cache.match(url.href)) ?? (await cache.match(pageKey(url)));
}

function pageKey(url) {
  return `${url.origin}${url.pathname}`;
}

function pathOf(requestUrl) {
  return new URL(requestUrl).pathname;
}

async function forgetTrip(cache, pathname) {
  const keys = await cache.keys();
  await Promise.all(keys.filter((key) => pathOf(key.url) === pathname).map((key) => cache.delete(key)));
}

// LRU semplice, sull'ordine di salvataggio. Le chiavi di una cache tornano in ordine di inserimento.
// Ogni salvataggio cancella prima le copie precedenti dello stesso viaggio, così la più recente va in
// coda; oltre MAX_TRIPS escono i più vecchi. Aprire un viaggio offline non cambia l'ordine.
async function keepRecentTrips(cache) {
  const keys = await cache.keys();
  const trips = [];
  for (const key of keys) {
    const pathname = pathOf(key.url);
    if (TRIP_DETAIL.test(pathname) && !trips.includes(pathname)) trips.push(pathname);
  }
  for (const pathname of trips.slice(0, Math.max(0, trips.length - MAX_TRIPS))) {
    await forgetTrip(cache, pathname);
  }
}

async function offlinePage(locale) {
  const cache = await caches.open(STATIC_CACHE);
  const saved = await cache.match(`/${locale}/offline`);
  if (saved) return saved;
  return new Response(FALLBACK_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Lingua dal primo segmento del percorso; senza prefisso vale quella predefinita.
function localeOf(pathname) {
  const first = pathname.split("/")[1];
  return LOCALES.includes(first) ? first : DEFAULT_LOCALE;
}
