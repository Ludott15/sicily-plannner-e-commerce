import { Compass, Map, User, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { pendingAttributes, type PendingId } from "@/lib/pending-actions";

// TabBar (docs/design/components/TabBar/README.md)
// Barra inferiore mobile: Esplora, Viaggi, Gruppi, Profilo. Etichette sempre visibili,
// icona 24px, voce attiva in lava con aria-current="page", altezza 56px più
// env(safe-area-inset-bottom). La barra del chatbot sta sopra; nella scheda attività
// la TabBar è sostituita dalla BookingBar.

export type TabKey = "explore" | "trips" | "groups" | "profile";

const TABS: { key: TabKey; href: string; label: "tabExplore" | "tabTrips" | "tabGroups" | "tabProfile"; icon: LucideIcon }[] = [
  { key: "explore", href: "/attivita", label: "tabExplore", icon: Compass },
  { key: "trips", href: "/viaggi", label: "tabTrips", icon: Map },
  { key: "groups", href: "/gruppi", label: "tabGroups", icon: Users },
  { key: "profile", href: "/profilo", label: "tabProfile", icon: User },
];

// pending: voci le cui pagine non esistono ancora (src/lib/pending-actions.ts).
// badges: numero su una voce (per il carrello, sulla voce Esplora); count 0 non mostra nulla.
export type TabBadge = { count: number; label: string };

export function TabBar({
  current,
  pending = {},
  badges = {},
}: {
  current?: TabKey;
  pending?: Partial<Record<TabKey, PendingId>>;
  badges?: Partial<Record<TabKey, TabBadge>>;
}) {
  const t = useTranslations("Design");
  return (
    <nav className="is-tabbar" aria-label={t("tabNav")}>
      {TABS.map(({ key, href, label, icon: Icon }) => {
        const pendingId = pending[key];
        const badge = badges[key];
        const content = (
          <>
            <span className="is-tabbar__icon">
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
              {badge && badge.count > 0 && (
                <span aria-hidden="true" className="is-tabbar__badge">
                  {badge.count > 9 ? "9+" : badge.count}
                </span>
              )}
            </span>
            {t(label)}
            {badge && badge.count > 0 && <span className="sr-only">{badge.label}</span>}
          </>
        );
        return pendingId ? (
          <span key={key} role="link" className="is-tabbar__item" {...pendingAttributes(pendingId)}>
            {content}
          </span>
        ) : (
          <Link key={key} href={href} className="is-tabbar__item" aria-current={key === current ? "page" : undefined}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
