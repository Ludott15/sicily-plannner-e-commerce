import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import type { SearchGroups } from "@/server/search/queries";

// Risultati completi di /cerca, raggruppati per tipo (Server Component: nessuno stato lato client).
// L'href arriva dal server senza prefisso di lingua: lo aggiunge il Link.
export async function SearchResults({ query, total, groups }: { query: string; total: number; groups: SearchGroups["groups"] }) {
  const t = await getTranslations("Search");
  return (
    <div className="flex flex-col gap-10">
      <p className="text-body text-lava-muted" aria-live="polite">
        {t("resultsCount", { count: total, query })}
      </p>
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`search-group-${group.kind}`} className="flex flex-col gap-3">
          <h2 id={`search-group-${group.kind}`} className="text-heading-3">
            {t(`kinds.${group.kind}`)}
          </h2>
          <ul className="flex flex-col divide-y divide-divider">
            {group.hits.map((hit) => (
              <li key={`${hit.kind}-${hit.slug}`}>
                <Link href={hit.href} className="flex min-h-11 flex-col justify-center gap-1 py-3 text-lava no-underline hover:underline hover:underline-offset-[6px]">
                  <span className="text-body font-semibold">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="text-body-s text-lava-muted">
                      {/* Per gli itinerari il server passa il numero di giorni. */}
                      {hit.kind === "itinerary" ? t("itineraryDays", { count: Number(hit.subtitle) }) : hit.subtitle}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
