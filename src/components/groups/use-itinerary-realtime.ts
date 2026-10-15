"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

// Tempo reale del viaggio di gruppo (4.2): canale broadcast privato "itinerary:<id>". I trigger del
// database inviano un messaggio a ogni modifica di tappe, voti, registro e proposte; la RLS di
// realtime.messages lo consegna solo ai membri del gruppo. Il messaggio non porta dati: si
// ricaricano quelli del server (router.refresh), con un debounce perché una modifica può toccare
// più righe in fila. Il canale si chiude allo smontaggio. Restituisce true quando la sottoscrizione è
// attiva (serve agli e2e per misurare i tempi da quel momento).

const DEBOUNCE_MS = 300;

export function useItineraryRealtime(itineraryId: string): boolean {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        router.refresh();
      }, DEBOUNCE_MS);
    };

    // Il canale privato usa il token della sessione: va impostato prima della sottoscrizione.
    // Il canale si crea solo se l'effetto non è già stato smontato: così la pulizia non tocca un
    // canale con lo stesso topic creato dall'effetto successivo (StrictMode in sviluppo).
    let channel: RealtimeChannel | undefined;
    void supabase.realtime
      .setAuth()
      .then(() => {
        if (cancelled) return;
        channel = supabase
          .channel(`itinerary:${itineraryId}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, refresh);
        channel.subscribe((status) => {
          if (!cancelled) setSubscribed(status === "SUBSCRIBED");
        });
      })
      .catch(() => {
        // Nessuna sessione valida: il canale privato non si sottoscrive (resta "connecting").
      });

    return () => {
      cancelled = true;
      setSubscribed(false);
      if (timer !== undefined) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [itineraryId, router]);

  return subscribed;
}
