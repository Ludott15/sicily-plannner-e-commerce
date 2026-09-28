import type { ReactNode } from "react";

// Barra fissa in basso su mobile, al posto della TabBar (schemi.md, "Navigazione mobile"):
// scheda attività (BookingBar) e itinerario pronto ("Usa questo itinerario" e Condividi).
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-divider bg-calce-raised px-4 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
      {children}
    </div>
  );
}
