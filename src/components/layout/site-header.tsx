import { getLocale, getTranslations } from "next-intl/server";
import { Bell, Search } from "lucide-react";
import { ButtonLink, Logo } from "@/components/design";
import { CartButton } from "@/components/cart/cart-button";
import { type ActionMenuItem } from "@/components/layout/action-menu";
import { AvatarMenu } from "@/components/layout/avatar-menu";
import { HeaderNav } from "@/components/layout/header-nav";
import { PRIMARY_NAV, SERVICE_NAV, SHOP_NAV, type NavLabelKey } from "@/components/layout/nav-links";
import { SiteHeaderFrame } from "@/components/layout/site-header-frame";
import { SiteSearch } from "@/components/search/site-search";
import { Link } from "@/lib/i18n/navigation";
import { signOut } from "@/server/auth/actions";
import { getHeaderUser } from "@/server/auth/header-user";
import { emptyCartView, readCart, readCartCount } from "@/server/shop/cart";

// Intestazione (brief 6.1, navigazione a due livelli; redesign della home del 2026-10-20).
// Desktop: logo, Itinerari, Attività, Guide, menu Servizi (Voli, Dove dormire, Noleggio auto, Traghetti,
// Tutti i servizi), Shop. A destra: ricerca, carrello, notifiche e avatar; senza sessione "Accedi".
// Sticky, con bordo sottile quando si scorre (SiteHeaderFrame). Voci in nav-links.ts.
// Mobile: logo, ricerca, carrello, campanella e avatar; la navigazione sta nella barra in basso (MobileTabBar),
// la cui voce Esplora porta alla pagina /esplora con le stesse voci.
// Ospite (sessione anonima): solo il menu personale, con I miei viaggi, Preferenze, Crea l'account ed Esci.
// Carrello: icona con il numero di articoli, a tutte le larghezze (drawer da md, pagina su mobile).
// Il bottone principale della pagina sta nella pagina, non qui.
export async function SiteHeader() {
  const [user, locale, t, tSearch] = await Promise.all([
    getHeaderUser(),
    getLocale(),
    getTranslations("Nav"),
    getTranslations("Search"),
  ]);
  // Carrello (passo 7.2): il conteggio viene dal cookie; la vista (con i prezzi) solo se c'è almeno un articolo.
  const cartCount = await readCartCount();
  const cartView = cartCount > 0 ? await readCart() : emptyCartView();

  const signOutItem: ActionMenuItem = {
    kind: "form",
    label: t("logout"),
    icon: "logout",
    action: signOut,
    fields: { locale },
  };

  // Etichette delle voci di navigazione, tradotte qui e passate al client (HeaderNav).
  const labelOf = (label: NavLabelKey) => t(label);
  const primaryLinks = PRIMARY_NAV.map((item) => ({ href: item.href, label: labelOf(item.label) }));
  const serviceLinks = SERVICE_NAV.map((item) => ({ href: item.href, label: labelOf(item.label), icon: item.icon }));
  const shopLink = { href: SHOP_NAV.href, label: labelOf(SHOP_NAV.label) };

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

  return (
    <SiteHeaderFrame>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 md:h-16 md:px-16">
        <div className="flex items-center gap-6 lg:gap-10">
          <Link
            href="/"
            aria-label={t("home")}
            className="text-heading-2 leading-none text-lava no-underline"
          >
            <Logo />
          </Link>
          <HeaderNav
            mainLabel={t("main")}
            primary={primaryLinks}
            servicesLabel={t("navServices")}
            services={serviceLinks}
            shop={shopLink}
          />
        </div>

        {/* Campo di ricerca da xl: fra md e xl la navigazione ha bisogno dello spazio, e resta l'icona. */}
        <div className="hidden min-w-0 flex-1 justify-end xl:flex">
          <div className="w-56 xl:w-72">
            <SiteSearch variant="header" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ButtonLink href="/cerca" variant="ghost" size="sm" className="xl:hidden" aria-label={tSearch("openSearch")}>
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>

          <CartButton count={cartCount} view={cartView} />

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
    </SiteHeaderFrame>
  );
}
