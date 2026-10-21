import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/design";
import { PRIMARY_NAV, SERVICE_NAV, SHOP_NAV, type NavLink } from "@/components/layout/nav-links";
import { BRAND_NAME } from "@/lib/brand";
import { Link } from "@/lib/i18n/navigation";
import { CookiePreferencesButton } from "./cookie-banner";

// Footer su superficie ink (manuale: ink solo per la voce locale e il footer), in quattro colonne:
// Viaggia (itinerari, attività, guide), Servizi (voli, alloggi, noleggio, traghetti, shop),
// Isula (chi siamo, contatti, link affiliati, crediti foto) e Legale. In fondo la nota di trasparenza
// sugli affiliati (manuale: ogni link affiliato dichiara il partner e la commissione).
const LINK_CLASS = "text-on-ink-muted no-underline hover:underline";

export async function SiteFooter() {
  const [tNav, tMeta] = await Promise.all([getTranslations("Nav"), getTranslations("Metadata")]);

  const travelLinks: NavLink[] = [...PRIMARY_NAV];
  const serviceLinks: NavLink[] = [...SERVICE_NAV, SHOP_NAV];
  const isulaLinks = [
    { href: "/chi-siamo", label: tNav("about") },
    { href: "/contatti", label: tNav("contact") },
    { href: "/affiliazioni", label: tNav("affiliateLinks") },
    { href: "/crediti-foto", label: tNav("photoCredits") },
  ];
  const legalLinks = [
    { href: "/privacy", label: tNav("privacy") },
    { href: "/termini", label: tNav("termsOfUse") },
    { href: "/condizioni-di-vendita", label: tNav("terms") },
    { href: "/accessibilita", label: tNav("accessibility") },
  ];

  return (
    <footer className="border-t border-ink-edge bg-ink text-on-ink">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-12 md:px-16 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2.5">
            <Logo className="text-[36px]" />
            <span className="text-body-s text-on-ink-muted">{tMeta("tagline")}</span>
          </div>
          <nav aria-label={tNav("footer")} className="grid grid-cols-2 gap-x-10 gap-y-8 text-body-s sm:grid-cols-4">
            <div>
              <p className="font-semibold">{tNav("travel")}</p>
              <ul className="mt-1 flex flex-col leading-7">
                {travelLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {tNav(item.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">{tNav("navServices")}</p>
              <ul className="mt-1 flex flex-col leading-7">
                {serviceLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {tNav(item.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">{BRAND_NAME}</p>
              <ul className="mt-1 flex flex-col leading-7">
                {isulaLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">{tNav("legal")}</p>
              <ul className="mt-1 flex flex-col leading-7">
                {legalLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <CookiePreferencesButton className={LINK_CLASS} />
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <p className="border-t border-ink-edge pt-6 text-body-s text-on-ink-muted">{tNav("affiliateNote")}</p>
      </div>
    </footer>
  );
}
