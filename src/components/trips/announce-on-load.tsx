"use client";

import { useEffect, useRef, useState } from "react";
import { takeAnnouncement } from "@/lib/announce";

// Esito dell'azione precedente (tappa aggiunta, viaggio salvato). Il messaggio riceve il focus: il
// lettore di schermo lo legge, e un messaggio già presente al caricamento non verrebbe annunciato.
export function AnnounceOnLoad() {
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Lettura una volta sola, nel browser: l'annuncio non esiste durante il rendering sul server.
    // StrictMode in sviluppo monta due volte l'effetto: la seconda lettura trova lo storage vuoto e
    // non deve cancellare il messaggio già letto.
    const next = takeAnnouncement();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'annuncio esiste solo nel browser
    if (next !== null) setMessage(next);
  }, []);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;
  return (
    <p ref={ref} tabIndex={-1} className="text-body font-semibold focus:outline-none">
      {message}
    </p>
  );
}
