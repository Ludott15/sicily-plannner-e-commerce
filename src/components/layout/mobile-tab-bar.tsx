"use client";

import { TabBar, type TabKey } from "@/components/design";
import { usePathname } from "@/lib/i18n/navigation";

// TabBar in fondo allo schermo su mobile (schemi.md, "Navigazione mobile").
// Nella scheda attività e nell'itinerario pronto lascia il posto alla barra delle azioni.
// Shop è in sospeso finché la pagina non esiste (src/lib/pending-actions.ts).
export function MobileTabBar() {
  const pathname = usePathname();
  if (/^\/(attivita|itinerari)\/[^/]+$/.test(pathname)) return null;

  const current: TabKey | undefined = pathname.startsWith("/attivita")
    ? "activities"
    : pathname.startsWith("/profilo")
      ? "profile"
      : pathname.startsWith("/viaggi")
        ? "trips"
        : undefined;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <TabBar current={current} pending={{ shop: "tabbar.shop" }} />
    </div>
  );
}
