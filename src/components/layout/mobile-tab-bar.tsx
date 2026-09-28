"use client";

import { TabBar, type TabKey } from "@/components/design";
import { usePathname } from "@/lib/i18n/navigation";

// TabBar in fondo allo schermo su mobile (schemi.md, "Navigazione mobile").
// Nella scheda attività e nell'itinerario pronto lascia il posto alla barra delle azioni.
// Viaggi e Shop sono in sospeso finché le pagine non esistono (src/lib/pending-actions.ts).
export function MobileTabBar() {
  const pathname = usePathname();
  if (/^\/(attivita|itinerari)\/[^/]+$/.test(pathname)) return null;

  const current: TabKey | undefined = pathname.startsWith("/attivita")
    ? "activities"
    : pathname.startsWith("/profilo")
      ? "profile"
      : undefined;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <TabBar current={current} pending={{ trips: "tabbar.trips", shop: "tabbar.shop" }} />
    </div>
  );
}
