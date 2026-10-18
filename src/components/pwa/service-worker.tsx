"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Registra il service worker (public/sw.js) in produzione, o in sviluppo con NEXT_PUBLIC_SW_DEV=1
// (in sviluppo il service worker interferisce con l'aggiornamento a caldo). Non mostra nulla.
//
// La sessione: il layout passa un identificatore opaco (hash dell'id utente, o "anon"). Il componente lo
// comunica al service worker a ogni cambio di pagina o di utente: così le pagine dei viaggi salvate
// restano legate a chi le ha aperte, anche dopo un'uscita fatta con una navigazione interna.

type Props = {
  /** Hash SHA-256 dell'id utente della sessione, oppure "anon" senza utente. */
  sessionId: string;
};

function serviceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";
}

export function ServiceWorkerRegistration({ sessionId }: Props) {
  const pathname = usePathname();

  // Registrazione una sola volta per caricamento della pagina.
  useEffect(() => {
    if (!serviceWorkerEnabled() || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Senza service worker l'app funziona come prima, solo online.
    });
  }, []);

  // Sessione: al primo caricamento, a ogni cambio di pagina e a ogni cambio di utente.
  useEffect(() => {
    if (!serviceWorkerEnabled() || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => {
        if (!cancelled) registration.active?.postMessage({ type: "session", id: sessionId });
      })
      .catch(() => {
        // Nessun service worker attivo: nulla da comunicare.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, pathname]);

  return null;
}
