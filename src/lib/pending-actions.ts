// Azioni dei mockup non ancora attive, marcate con data-pending="<milestone>" e
// data-pending-id="<id>". Di solito sono visibili e disabilitate (PendingButton), per giudicare
// la gerarchia reale; quelle che non devono comparire affatto (punti, offerte) sono solo un
// segnaposto nascosto (PendingMarker). I testi che scrive Ludovico (Chi siamo) e i testi legali
// sono un segnaposto visibile (PendingText): bloccano il lancio come le azioni.
// Ogni milestone che implementa un'azione la toglie da qui: il test e2e
// (e2e/pending-actions.spec.ts) confronta questo elenco con quello che trova nelle pagine.
// Prima del lancio l'elenco deve essere vuoto (controllo attivo con PRE_LAUNCH=1).
// "vertical.*": alloggi e noleggi restano "in arrivo" finché il partner non ha il proprio ID
// nell'ambiente (M6-partner, passo 3.1).

export const PENDING_ACTIONS = {
  "points.rules": "legale",
  "about.editorial": "testi",
  "about.founder": "testi",
  "onboarding.privacy": "testi",
  "preferences.consent": "testi",
  "vertical.lodging": "M6-partner",
  "vertical.car": "M6-partner",
  "legal.privacy": "legale",
  "legal.cookie": "legale",
  "legal.terms": "legale",
} as const;

export type PendingId = keyof typeof PENDING_ACTIONS;

// Attributi da mettere sull'elemento dell'azione in sospeso.
export function pendingAttributes(id: PendingId) {
  return {
    "aria-disabled": true,
    "data-pending": PENDING_ACTIONS[id],
    "data-pending-id": id,
  } as const;
}

// Una pagina con testi in sospeso non si indicizza (robots noindex) e non sta nella sitemap:
// togliendo l'id dall'elenco quando il testo è scritto, la pagina si apre ai motori di ricerca.
export function isPending(...ids: PendingId[]): boolean {
  return ids.some((id) => id in PENDING_ACTIONS);
}

// "Disponibile a breve" compare solo in sviluppo.
export const SHOW_PENDING_HINT = process.env.NODE_ENV === "development";
