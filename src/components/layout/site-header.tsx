import { getLocale, getTranslations } from "next-intl/server";
import { Bell, Search } from "lucide-react";
import { ButtonLink, Logo } from "@/components/design";
import { ActionMenu, type ActionMenuItem } from "@/components/layout/action-menu";
import { AvatarMenu } from "@/components/layout/avatar-menu";
import { SiteSearch } from "@/components/search/site-search";
import { Link } from "@/lib/i18n/navigation";
import { signOut } from "@/server/auth/actions";
import { getHeaderUser } from "@/server/auth/header-user";

// Intestazione (brief 6.1, navigazione a due livelli).
// Desktop: logo, Esplora (menu: Attività, Itinerari pronti, Noleggio auto), Voli, Dove dormire.
// A destra: senza sessione "Accedi"; con account la campanella e il menu personale (avatar con le iniziali).
// Mobile: logo, campanella e avatar; la navigazione sta nella barra in basso (MobileTabBar).
// Ospite (sessione anonima): solo il menu personale, con I miei viaggi, Preferenze, Crea l'account ed Esci.
// Il bottone principale della pagina sta nella pagina, non qui.
export async function SiteHeader() {
  const [user, locale, t, tSearch] = await Promise.all([
    getHeaderUser(),
    getLocale(),
    getTranslations("Nav"),
    getTranslations("Search"),
  ]);

  const signOutItem: ActionMenuItem = {
    kind: "form",
    label: t("logout"),
    icon: "logout",
    action: signOut,
    fields: { locale },
  };

  const exploreItems: ActionMenuItem[] = [
    { kind: "link", href: "/attivita", label: t("activities"), icon: "compass" },
    { kind: "link", href: "/itinerari", label: t("itineraries"), icon: "map" },
    { kind: "link", href: "/guide", label: t("guides"), icon: "book" },
    { kind: "link", href: "/noleggio-auto", label: t("car"), icon: "car" },
    { kind: "link", href: "/shop", label: t("shop") },
  ];

  const memberItems: ActionMenuItem[] = [
    { kind: "link", href: "/viaggi", label: t("trips"), icon: "map" },
    { kind: "link", href: "/chat", label: t("assistant"), icon: "message" },
    { kind: "link", href: "/gruppi", label: t("groups"), icon: "users" },
    { kind: "link", href: "/punti", label: t("points"), icon: "star" },
    { kind: "link", href: "/classifica", label: t("leaderboard"), icon: "trophy" },
    { kind: "link", href: "/notifiche", label: t("notifications"), icon: "bell" },
    { kind: "link", href: "/preferenze", label: t("preferences"), icon: "settings" },
    { kind: "link", href: "/profilo", label: t("profile"), icon: "user" },
    { kind: "separator" },
    signOutItem,
  ];

  const guestItems: ActionMenuItem[] = [
    { kind: "link", href: "/viaggi", label: t("trips"), icon: "map" },
    { kind: "link", href: "/chat", label: t("assistant"), icon: "message" },
    { kind: "link", href: "/preferenze", label: t("preferences"), icon: "settings" },
    { kind: "link", href: "/profilo", label: t("createAccount"), icon: "user" },
    { kind: "separator" },
    signOutItem,
  ];

  const navLinkClass = "rounded-md text-lava no-underline hover:underline hover:underline-offset-[6px]";

  return (
    <header className="border-b border-divider bg-calce">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 md:h-16 md:px-16">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            aria-label={t("home")}
            className="text-[26px] leading-none text-lava no-underline md:text-[30px]"
          >
            <Logo />
          </Link>
          <nav aria-label={t("main")} className="hidden items-center gap-6 text-[15px] font-medium md:flex">
            <ActionMenu variant="text" text={t("explore")} items={exploreItems} align="start" />
            <Link href="/voli" className={navLinkClass}>
              {t("flights")}
            </Link>
            <Link href="/dove-dormire" className={navLinkClass}>
              {t("lodging")}
            </Link>
          </nav>
        </div>

        {/* Campo di ricerca da lg (nel tablet la navigazione ha bisogno dello spazio): sotto, l'icona. */}
        <div className="hidden min-w-0 flex-1 justify-end lg:flex">
          <div className="w-56 xl:w-72">
            <SiteSearch variant="header" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ButtonLink href="/cerca" variant="ghost" size="sm" className="lg:hidden" aria-label={tSearch("openSearch")}>
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>

          {user?.kind === "member" && (
            <ButtonLink
              href="/notifiche"
              variant="ghost"
              size="sm"
              className="relative"
              aria-label={user.unread > 0 ? t("notificationsCount", { count: user.unread }) : t("notifications")}
            >
              <Bell size={20} strokeWidth={1.5} aria-hidden="true" />
              {user.unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-pill bg-coccio px-1 text-caption font-semibold text-on-coccio"
                >
                  {user.unread > 9 ? "9+" : user.unread}
                </span>
              )}
            </ButtonLink>
          )}

          {user?.kind === "member" && (
            <AvatarMenu
              label={t("personalMenu")}
              initials={user.initials}
              avatarUrl={user.avatarUrl}
              items={memberItems}
            />
          )}
          {user?.kind === "guest" && <AvatarMenu label={t("personalMenu")} initials={null} items={guestItems} />}
          {(!user || user.kind === "anonymous") && (
            <ButtonLink href="/login" variant="secondary" size="sm">
              {t("login")}
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
