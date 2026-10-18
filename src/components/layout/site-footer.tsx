import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/design";
import { BRAND_NAME } from "@/lib/brand";
import { Link } from "@/lib/i18n/navigation";
import { CookiePreferencesButton } from "./cookie-banner";

// Footer su superficie ink (manuale: ink solo per la voce locale e il footer).
// Colonne del mockup ridotte alle pagine che esistono già (voli e shop arrivano con le loro
// milestone), più Isula (chi siamo, link affiliati) e le informazioni legali.
export async function SiteFooter() {
  const [tNav, tMeta] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Metadata"),
  ]);

  return (
    <footer className="border-t border-ink-edge bg-ink text-on-ink">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-12 md:flex-row md:items-start md:justify-between md:px-16 md:py-14">
        <div className="flex flex-col gap-2.5">
          <Logo className="text-[36px]" />
          <span className="text-body-s text-on-ink-muted">
            {tMeta("tagline")}
          </span>
        </div>
        <nav
          aria-label={tNav("footer")}
          className="flex flex-wrap gap-x-16 gap-y-8 text-body-s"
        >
          <div>
            <p className="font-semibold">{tNav("travel")}</p>
            <ul className="mt-1 flex flex-col leading-7">
              <li>
                <Link
                  href="/itinerari"
                  className="text-on-ink-muted no-underline hover:underline"
                >
                  {tNav("itineraries")}
                </Link>
              </li>
              <li>
                <Link
                  href="/attivita"
                  className="text-on-ink-muted no-underline hover:underline"
                >
                  {tNav("activities")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">{BRAND_NAME}</p>
            <ul className="mt-1 flex flex-col leading-7">
              {(
                [
                  ["/chi-siamo", "about"],
                  ["/affiliazioni", "affiliateLinks"],
                  ["/crediti-foto", "photoCredits"],
                ] as const
              ).map(([href, key]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-on-ink-muted no-underline hover:underline"
                  >
                    {tNav(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">{tNav("legal")}</p>
            <ul className="mt-1 flex flex-col leading-7">
              {(
                [
                  ["/privacy", "privacy"],
                  ["/cookie", "cookie"],
                  ["/condizioni-di-vendita", "terms"],
                ] as const
              ).map(([href, key]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-on-ink-muted no-underline hover:underline"
                  >
                    {tNav(key)}
                  </Link>
                </li>
              ))}
              <li>
                <CookiePreferencesButton className="text-on-ink-muted hover:underline" />
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
