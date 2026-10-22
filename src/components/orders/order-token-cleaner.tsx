"use client";

import { useEffect } from "react";

// Toglie ?t=<token> dalla barra degli indirizzi dopo il caricamento (passo 7.3). La pagina è già stata
// letta dal server, quindi il token non serve più nell'URL: così non resta in cronologia né nei segnalibri.
// Lo stato del router di Next (history.state) si conserva. Un errore non cambia nulla per l'utente.
export function OrderTokenCleaner() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("t")) return;
      url.searchParams.delete("t");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Browser senza History API o URL non leggibile: il link resta com'è.
    }
  }, []);
  return null;
}
