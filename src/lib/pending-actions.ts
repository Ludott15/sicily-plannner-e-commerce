// Azioni dei mockup non ancora attive, marcate con data-pending="<milestone>" e
// data-pending-id="<id>". Di solito sono visibili e disabilitate (PendingButton), per giudicare
// la gerarchia reale; quelle che non devono comparire affatto sono solo un segnaposto nascosto
// (PendingMarker).
// Ogni milestone che implementa un'azione la toglie da qui: il test e2e
// (e2e/pending-actions.spec.ts) confronta questo elenco con quello che trova nelle pagine.
// Prima del lancio l'elenco deve essere vuoto (controllo attivo con PRE_LAUNCH=1).
// I testi legali, Chi siamo, il regolamento dei punti e l'informativa in onboarding non sono più
// qui: sono scritti, e la loro prontezza si verifica a runtime con isLegalReady()
// (src/lib/legal-entity.ts): finché mancano i dati del titolare le pagine restano noindex.
// "vertical.*": alloggi e noleggi restano "in arrivo" finché il partner non ha il proprio ID
// nell'ambiente (M6-partner, passo 3.1).

export const PENDING_ACTIONS = {
  "vertical.lodging": "M6-partner",
  "vertical.car": "M6-partner",
  // Aggiungi al carrello (ProductCard, pagina prodotto): il carrello è il passo 7.2.
  "cart.add": "7.2",
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

// Una pagina con azioni in sospeso non si indicizza (robots noindex) e non sta nella sitemap.
export function isPending(...ids: PendingId[]): boolean {
  return ids.some((id) => id in PENDING_ACTIONS);
}

// "Disponibile a breve" compare solo in sviluppo.
export const SHOW_PENDING_HINT = process.env.NODE_ENV === "development";
