"use client";

import { TabBar, type TabKey } from "@/components/design";
import { usePathname } from "@/lib/i18n/navigation";

// TabBar in fondo allo schermo su mobile (brief 6.1: Esplora, Viaggi, Gruppi, Profilo).
// Nella scheda attività e nell'itinerario pronto lascia il posto alla barra delle azioni.
// Le pagine personali di secondo livello (punti, classifica, notifiche, preferenze) stanno sotto Profilo.
const SECTIONS: { key: TabKey; pattern: RegExp }[] = [
  { key: "explore", pattern: /^\/(attivita|itinerari|voli|dove-dormire|noleggio-auto|luoghi)(\/|$)/ },
  { key: "trips", pattern: /^\/(viaggi|viaggio)(\/|$)/ },
  { key: "groups", pattern: /^\/gruppi(\/|$)/ },
  { key: "profile", pattern: /^\/(profilo|punti|classifica|notifiche|preferenze)(\/|$)/ },
];

export function MobileTabBar() {
  const pathname = usePathname();
  if (/^\/(attivita|itinerari)\/[^/]+$/.test(pathname)) return null;

  const current = SECTIONS.find(({ pattern }) => pattern.test(pathname))?.key;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <TabBar current={current} />
    </div>
  );
}
