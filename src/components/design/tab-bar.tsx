import { Compass, Map, ShoppingBag, User, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

// TabBar (docs/design/components/TabBar/README.md)
// Barra inferiore mobile: Viaggi, Attività, Shop, Profilo. Etichette sempre visibili,
// icona 24px, voce attiva in lava con aria-current="page", altezza 56px più
// env(safe-area-inset-bottom). La barra del chatbot sta sopra; nella scheda attività
// la TabBar è sostituita dalla BookingBar.

export type TabKey = "trips" | "activities" | "shop" | "profile";

const TABS: { key: TabKey; href: string; label: "tabTrips" | "tabActivities" | "tabShop" | "tabProfile"; icon: LucideIcon }[] = [
  { key: "trips", href: "/viaggi", label: "tabTrips", icon: Map },
  { key: "activities", href: "/attivita", label: "tabActivities", icon: Compass },
  { key: "shop", href: "/shop", label: "tabShop", icon: ShoppingBag },
  { key: "profile", href: "/profilo", label: "tabProfile", icon: User },
];

export function TabBar({ current }: { current?: TabKey }) {
  const t = useTranslations("Design");
  return (
    <nav className="is-tabbar" aria-label={t("tabNav")}>
      {TABS.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href} className="is-tabbar__item" aria-current={key === current ? "page" : undefined}>
          <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
