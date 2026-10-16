// Regola per l'invito all'installazione (passo 11.3). Logica pura: il componente raccoglie i dati
// dal browser e il server conta i viaggi; qui si decide solo se mostrare l'invito.

// Mai al primo accesso: serve almeno un secondo viaggio salvato.
export const MIN_TRIPS_FOR_INSTALL = 2;

export type InstallOfferInput = {
  /** Viaggi salvati dall'utente (in arrivo e passati). */
  trips: number;
  /** Il sito è aperto nel browser interno di un'app social (TikTok, Instagram...). */
  inApp: boolean;
  /** L'app è già installata (display-mode standalone). */
  standalone: boolean;
  /** L'utente ha scelto "Non ora" su questo browser. */
  dismissed: boolean;
};

export function shouldOfferInstall({ trips, inApp, standalone, dismissed }: InstallOfferInput): boolean {
  return trips >= MIN_TRIPS_FOR_INSTALL && !inApp && !standalone && !dismissed;
}
