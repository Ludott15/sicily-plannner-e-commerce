import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

// Footer su superficie ink (manuale: ink solo per la voce locale e il footer).
// Colonne del mockup ridotte alle pagine che esistono già: le altre (voli, shop,
// chi siamo, link affiliati, privacy) arrivano con le rispettive milestone.
export async function SiteFooter() {
  const [tNav, tMeta] = await Promise.all([getTranslations("Nav"), getTranslations("Metadata")]);

  return (
    <footer className="border-t border-ink-edge bg-ink text-on-ink">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-12 md:flex-row md:items-start md:justify-between md:px-16 md:py-14">
        <div className="flex flex-col gap-2.5">
          <span className="is-display text-[36px] leading-none tracking-[-0.02em]">Isula</span>
          <span className="text-body-s text-on-ink-muted">{tMeta("tagline")}</span>
        </div>
        <nav aria-label={tNav("footer")} className="text-body-s">
          <p className="font-semibold">{tNav("travel")}</p>
          <ul className="mt-1 flex flex-col leading-7">
            <li>
              <Link href="/itinerari" className="text-on-ink-muted no-underline hover:underline">
                {tNav("itineraries")}
              </Link>
            </li>
            <li>
              <Link href="/attivita" className="text-on-ink-muted no-underline hover:underline">
                {tNav("activities")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
