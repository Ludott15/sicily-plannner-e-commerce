// Azioni dei mockup visibili ma non ancora attive: compaiono disabilitate, marcate con
// data-pending="<milestone>" e data-pending-id="<id>", per giudicare la gerarchia reale.
// Ogni milestone che implementa un'azione la toglie da qui: il test e2e
// (e2e/pending-actions.spec.ts) confronta questo elenco con quello che trova nelle pagine.
// Prima del lancio l'elenco deve essere vuoto (controllo attivo con PRE_LAUNCH=1).

export const PENDING_ACTIONS = {
  "home.create-trip": "M4",
  "activity.add-to-trip": "M5",
  "activity.save": "M5",
  "card.save": "M5",
  "card.add": "M5",
  "itinerary.use": "M5",
  "tabbar.trips": "M5",
  "tabbar.shop": "M10",
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

// "Disponibile a breve" compare solo in sviluppo.
export const SHOW_PENDING_HINT = process.env.NODE_ENV === "development";
