import { getLocale, getTranslations } from "next-intl/server";
import { Bell } from "lucide-react";
import { Button, ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { getUser } from "@/server/auth";
import { signOut } from "@/server/auth/actions";
import { unreadNotificationsCount } from "@/server/notifications/queries";

// Intestazione (mockup Home e Attività): marchio "Isula" in Fraunces 600 lava, navigazione,
// "Accedi" secondario. Il bottone principale della vista sta nella pagina, non qui.
// Le voci "I miei viaggi" e "Shop" arrivano con le rispettive milestone.
// "Preferenze" per chiunque abbia una sessione, ospite compreso.
// Un ospite (sessione anonima) vede "Salva l'account" al posto di Profilo ed Esci: uscendo
// perderebbe i suoi viaggi, quindi l'uscita sta nel profilo, con l'avviso.
export async function SiteHeader() {
  const [user, locale, t] = await Promise.all([getUser(), getLocale(), getTranslations("Nav")]);
  // Campanella (4.2): solo per chi ha un account; un ospite non riceve notifiche di gruppo.
  const registered = user !== null && !user.is_anonymous;
  const unread = user && registered ? await unreadNotificationsCount(user) : 0;

  return (
    <header className="border-b border-divider bg-calce">
      <div className="mx-auto flex h-15 max-w-[1200px] items-center justify-between gap-4 px-4 md:h-18 md:px-16">
        <div className="flex items-center gap-12">
          <Link
            href="/"
            aria-label={t("home")}
            className="is-display text-[26px] leading-none tracking-[-0.02em] text-lava no-underline md:text-[30px]"
          >
            Isula
          </Link>
          <nav aria-label={t("main")} className="hidden gap-8 text-[15px] font-medium md:flex">
            <Link href="/attivita" className="text-lava no-underline hover:underline hover:underline-offset-[6px]">
              {t("activities")}
            </Link>
            <Link href="/itinerari" className="text-lava no-underline hover:underline hover:underline-offset-[6px]">
              {t("itineraries")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user && registered && (
            <ButtonLink
              href="/notifiche"
              variant="ghost"
              size="sm"
              className="relative"
              aria-label={unread > 0 ? t("notificationsCount", { count: unread }) : t("notifications")}
            >
              <Bell size={20} strokeWidth={1.5} aria-hidden="true" />
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-pill bg-coccio px-1 text-caption font-semibold text-on-coccio"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </ButtonLink>
          )}
          {user && (
            <ButtonLink href="/preferenze" variant="ghost" size="sm">
              {t("preferences")}
            </ButtonLink>
          )}
          {user?.is_anonymous ? (
            <ButtonLink href="/profilo" variant="secondary" size="sm">
              {t("saveAccount")}
            </ButtonLink>
          ) : user ? (
            <>
              <ButtonLink href="/profilo" variant="ghost" size="sm">
                {t("profile")}
              </ButtonLink>
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="secondary" size="sm">
                  {t("logout")}
                </Button>
              </form>
            </>
          ) : (
            <ButtonLink href="/login" variant="secondary" size="sm">
              {t("login")}
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
