"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { InterestChip, Select, type Domain } from "@/components/design";
import { activityFiltersQuery, type ActivityFilters as Filters } from "@/lib/activity-filters";
import { useRouter } from "@/lib/i18n/navigation";

// Filtri della lista attività, compatti: interessi con InterestChip (basta uno dei selezionati) e
// provincia con un select nativo accanto, sulla stessa riga da desktop. Lo stato è nell'URL e la
// lista la renderizza il server: qui si cambia solo l'URL. La selezione si aggiorna subito
// (useOptimistic) mentre il server prepara la lista.
export function ActivityFilters({
  interests,
  provinces,
  selected,
}: {
  interests: { key: string; label: string; domain?: Domain }[];
  provinces: { code: string; name: string }[];
  selected: Filters;
}) {
  const t = useTranslations("Catalog");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useOptimistic(selected);

  function apply(next: Filters) {
    startTransition(() => {
      setFilters(next);
      router.replace({ pathname: "/attivita", query: activityFiltersQuery(next) }, { scroll: false });
    });
  }

  function toggleInterest(key: string, pressed: boolean) {
    const keys = new Set(filters.interests);
    if (pressed) keys.add(key);
    else keys.delete(key);
    apply({ ...filters, interests: interests.map((i) => i.key).filter((k) => keys.has(k)) });
  }

  return (
    <div
      className="flex flex-col gap-4 border-y border-divider py-5 md:flex-row md:items-end md:justify-between md:gap-6"
      aria-busy={pending}
    >
      <fieldset className="min-w-0 flex-1">
        <legend className="text-body-s font-semibold">{t("filterInterests")}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.map((interest) => (
            <InterestChip
              key={interest.key}
              label={interest.label}
              domain={interest.domain}
              pressed={filters.interests.includes(interest.key)}
              onPressedChange={(pressed) => toggleInterest(interest.key, pressed)}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5 md:w-64 md:shrink-0">
        <label htmlFor="filtro-provincia" className="text-body-s font-semibold">
          {t("filterProvince")}
        </label>
        <Select
          id="filtro-provincia"
          label={t("filterProvince")}
          value={filters.province ?? ""}
          onValueChange={(value) => apply({ ...filters, province: value || null })}
          options={[
            { value: "", label: t("filterAllProvinces") },
            ...provinces.map((p) => ({ value: p.code, label: p.name })),
          ]}
        />
      </div>
    </div>
  );
}
