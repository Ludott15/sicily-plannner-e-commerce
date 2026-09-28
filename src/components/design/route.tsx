"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Lista delle tappe di un giorno: una sola linea del percorso per giorno, disegnata
// dalla lista (is-route::before), non un pezzo per tappa (ItineraryStop/README.md).
// La linea va dal centro del primo punto al centro dell'ultimo: le posizioni dipendono
// dall'altezza delle card, quindi si misurano (--route-start, --route-end) e si
// rimisurano quando la lista cambia dimensione.
// draw: solo alla prima apertura la linea si scopre dall'alto in dur-route e ogni
// punto compare quando la linea lo raggiunge (movimento.md): ritardo = distanza del
// punto dall'inizio della linea / lunghezza della linea × durata. Al cambio di giorno
// si passa draw={false}.

export function Route({ draw = false, children }: { draw?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;

    const measure = () => {
      const dots = [...list.querySelectorAll<HTMLElement>(".is-stop__dot")];
      if (dots.length === 0) return;
      const listRect = list.getBoundingClientRect();
      const centers = dots.map((dot) => {
        const r = dot.getBoundingClientRect();
        return r.top + r.height / 2 - listRect.top;
      });
      const start = centers[0]!;
      const end = centers[centers.length - 1]!;
      list.style.setProperty("--route-start", `${start}px`);
      list.style.setProperty("--route-end", `${listRect.height - end}px`);

      if (!draw) return;
      const duration = parseFloat(getComputedStyle(list).getPropertyValue("--dur-route")) || 0;
      const length = end - start || 1;
      dots.forEach((dot, i) => {
        dot.style.setProperty("--dot-delay", `${Math.round(((centers[i]! - start) / length) * duration)}ms`);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [draw, children]);

  return (
    <ol ref={ref} className={cn("is-route", draw && "is-route--draw")}>
      {children}
    </ol>
  );
}
