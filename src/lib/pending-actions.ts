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
// Le verticali (alloggi, noleggi, traghetti, ...) non sono più in sospeso: il link firmato funziona anche
// senza ID del partner (il click si registra comunque). Chi non è attivo mostra un avviso, non "in arrivo".

export const PENDING_ACTIONS = {
  // Pagamento (passo 7.2): in sospeso solo senza provider (né STRIPE_SECRET_KEY né CHECKOUT_TEST_PROVIDER=fake).
  // La pagina del carrello lo mostra in quel caso; con il provider il pulsante è attivo.
  "checkout.pay": "7.2-stripe",
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
