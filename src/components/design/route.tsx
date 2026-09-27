"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Lista delle tappe di un giorno: una sola linea del percorso per giorno, disegnata
// dalla lista (is-route::before), non un pezzo per tappa (ItineraryStop/README.md).
// draw: solo alla prima apertura la linea si scopre dall'alto in dur-route e ogni
// punto compare quando la linea lo raggiunge (movimento.md): ritardo = offsetTop del
// punto / altezza della lista × durata. Al cambio di giorno si passa draw={false}.

export function Route({ draw = false, children }: { draw?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!draw || !list) return;
    const duration = parseFloat(getComputedStyle(list).getPropertyValue("--dur-route")) || 0;
    const height = list.offsetHeight || 1;
    list.querySelectorAll<HTMLElement>(".is-stop__dot").forEach((dot) => {
      const top = dot.getBoundingClientRect().top - list.getBoundingClientRect().top;
      dot.style.setProperty("--dot-delay", `${Math.round((top / height) * duration)}ms`);
    });
  }, [draw]);

  return (
    <ol ref={ref} className={cn("is-route", draw && "is-route--draw")}>
      {children}
    </ol>
  );
}
