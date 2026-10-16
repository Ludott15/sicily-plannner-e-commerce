"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TRAVEL_PARTIES, type TravelParty } from "@/lib/itinerary-checks";
import { useRouter } from "@/lib/i18n/navigation";
import { DAY_BUCKETS, templateFiltersQuery, type DayBucket, type TemplateFilters as Filters } from "@/lib/template-filters";
import { cn } from "@/lib/utils";

// Filtri della lista degli itinerari pronti. Durata e "per chi" sono due righe di chip: su mobile
// scorrono in orizzontale, su desktop vanno a capo. Zona e mese stanno in un pannello "Filtri":
// su mobile si apre con il pulsante, su desktop sono sempre visibili in una riga compatta.
// Lo stato è nell'URL e la lista la renderizza il server: qui si cambia solo l'URL, e la scelta si
// vede subito (useOptimistic). Stesso schema di ActivityFilters.

const PANEL_ID = "filtri-zona-mese";

export function TemplateFilters({
  areas,
  selected,
}: {
  areas: { slug: string; name: string }[];
  selected: Filters;
}) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useOptimistic(selected);
  const [panelOpen, setPanelOpen] = useState(false);

  function apply(next: Filters) {
    startTransition(() => {
      setFilters(next);
      router.replace({ pathname: "/itinerari", query: templateFiltersQuery(next) }, { scroll: false });
    });
  }

  function toggleDay(bucket: DayBucket) {
    const days = filters.days.includes(bucket) ? filters.days.filter((d) => d !== bucket) : [...filters.days, bucket];
    apply({ ...filters, days: DAY_BUCKETS.filter((d) => days.includes(d)) });
  }

  function togglePartyOf(party: TravelParty) {
    apply({ ...filters, party: filters.party === party ? null : party });
  }

  const monthFormat = new Intl.DateTimeFormat(locale, { month: "long" });
  const extraCount = (filters.area !== null ? 1 : 0) + (filters.month !== null ? 1 : 0);

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("filterDays")}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {DAY_BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="button"
              className="is-chip shrink-0"
              aria-pressed={filters.days.includes(bucket)}
              onClick={() => toggleDay(bucket)}
            >
              {t(`dayBuckets.${bucket}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("filterParty")}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {TRAVEL_PARTIES.map((party) => (
            <button
              key={party}
              type="button"
              className="is-chip shrink-0"
              aria-pressed={filters.party === party}
              onClick={() => togglePartyOf(party)}
            >
              {t(`partyOptions.${party}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="md:hidden">
        <button
          type="button"
          className="is-chip"
          aria-expanded={panelOpen}
          aria-controls={PANEL_ID}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {t("v2.filtersToggle")}
          {extraCount > 0 && <span className="ml-1 text-lava-muted">· {extraCount}</span>}
        </button>
      </div>

      <div
        id={PANEL_ID}
        className={cn("gap-4 md:grid md:max-w-xl md:grid-cols-2 md:gap-6", panelOpen ? "grid" : "hidden")}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-zona" className="text-body-s font-semibold">
            {t("filterArea")}
          </label>
          <select
            id="filtro-zona"
            className="min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava"
            value={filters.area ?? ""}
            onChange={(event) => apply({ ...filters, area: event.target.value || null })}
          >
            <option value="">{t("filterAllAreas")}</option>
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-mese" className="text-body-s font-semibold">
            {t("filterMonth")}
          </label>
          <select
            id="filtro-mese"
            className="min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava"
            value={filters.month ?? ""}
            onChange={(event) => apply({ ...filters, month: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">{t("filterAny")}</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <option key={month} value={month}>
                {monthFormat.format(new Date(2026, month - 1, 1))}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
