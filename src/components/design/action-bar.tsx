"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Barra fissa in basso su mobile, al posto della TabBar (schemi.md, "Navigazione mobile"):
// scheda attività (BookingBar) e itinerario pronto ("Usa questo itinerario" e Condividi).
// È più alta della TabBar e la sua altezza dipende dal contenuto, quindi si misura:
// --bottom-bar-h sul body (altezza della barra, safe-area compresa) diventa lo spazio in
// fondo alla pagina, così la barra non copre il footer.
export function ActionBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const body = document.body;
    const measure = () => body.style.setProperty("--bottom-bar-h", `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      body.style.removeProperty("--bottom-bar-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-divider bg-calce-raised px-4 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden"
    >
      {children}
    </div>
  );
}
