"use client";

import { useTranslations } from "next-intl";
import { TabBar, type TabKey } from "@/components/design";
import { usePathname } from "@/lib/i18n/navigation";

// TabBar in fondo allo schermo su mobile (brief 6.1: Esplora, Viaggi, Gruppi, Profilo).
// Nella scheda attività e nell'itinerario pronto lascia il posto alla barra delle azioni.
// Le pagine personali di secondo livello (punti, classifica, notifiche, preferenze) stanno sotto Profilo.
// Il carrello (passo 7.2) sta sotto Esplora, dove vive lo shop: il suo numero di articoli è sulla voce Esplora.
// Il carrello è anche nell'intestazione, a tutte le larghezze: la barra non ha una quinta voce.
const SECTIONS: { key: TabKey; pattern: RegExp }[] = [
  { key: "explore", pattern: /^\/(attivita|itinerari|voli|dove-dormire|noleggio-auto|luoghi|shop|prodotti|carrello)(\/|$)/ },
  { key: "trips", pattern: /^\/(viaggi|viaggio)(\/|$)/ },
  { key: "groups", pattern: /^\/gruppi(\/|$)/ },
  { key: "profile", pattern: /^\/(profilo|punti|classifica|notifiche|preferenze|chat)(\/|$)/ },
];

export function MobileTabBar({ cartCount }: { cartCount: number }) {
  const t = useTranslations("Cart");
  const pathname = usePathname();
  if (/^\/(attivita|itinerari)\/[^/]+$/.test(pathname)) return null;

  const current = SECTIONS.find(({ pattern }) => pattern.test(pathname))?.key;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      <TabBar current={current} badges={{ explore: { count: cartCount, label: t("openCart", { count: cartCount }) } }} />
    </div>
  );
}
