import { getLocale, getTranslations } from "next-intl/server";
import type { PublishCheck } from "@/lib/itinerary-checks";

// Riquadro "Prima di pubblicare" e fatti calcolati di un itinerario pronto. Sono letti dal
// server a ogni caricamento: nessun dato qui si salva. Un controllo non passato mostra una riga
// per ogni dettaglio (giorno, attività, minuti sul limite del ritmo).

export type TemplateFactsView = {
  budgetPerDayEur: number | null;
  requiresCar: boolean;
  areas: { id: string; nameIt: string; nameEn: string }[];
};

type CheckLine = { key: string; ok: boolean; text: string };

export async function TemplateChecks({
  checks,
  facts,
  days,
}: {
  checks: PublishCheck[];
  facts: TemplateFactsView;
  days: number;
}) {
  const t = await getTranslations("Admin");
  const locale = await getLocale();

  const lines: CheckLine[] = checks.flatMap((check): CheckLine[] => {
    if (check.ok) return [{ key: check.code, ok: true, text: t(`checksPassed.${check.code}`) }];
    if (check.details.length === 0) {
      return [{ key: check.code, ok: false, text: t(`templateChecks.${check.code}`) }];
    }
    return check.details.map((detail, i) => ({
      key: `${check.code}-${i}`,
      ok: false,
      text: t(`templateChecks.${check.code}`, {
        day: detail.day ?? 0,
        activity: detail.activity ?? "",
        minutes: detail.minutes ?? 0,
        limit: detail.limit ?? 0,
      }),
    }));
  });

  const areaNames = facts.areas.map((area) => (locale === "en" ? area.nameEn : area.nameIt));

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="controlli-titolo" className="rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
        <h2 id="controlli-titolo" className="is-display text-heading-2">
          {t("templateChecks.title")}
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.key} className="flex gap-3 text-body">
              <span className={line.ok ? "shrink-0 text-body-s font-semibold text-success" : "shrink-0 text-body-s font-semibold text-danger"}>
                {line.ok ? t("templateChecks.ok") : t("templateChecks.todo")}
              </span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fatti-titolo" className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
        <h2 id="fatti-titolo" className="is-display text-heading-2">
          {t("factsTitle")}
        </h2>
        <p className="text-caption text-lava-muted">{t("factsHint")}</p>
        <ul className="flex flex-col gap-2 text-body">
          <li>{t("factsDays", { count: days })}</li>
          <li>{areaNames.length > 0 ? t("factsAreas", { areas: areaNames.join(", ") }) : t("factsNoAreas")}</li>
          <li>{facts.requiresCar ? t("factsCarYes") : t("factsCarNo")}</li>
          <li>
            {facts.budgetPerDayEur === null ? t("factsNoBudget") : t("factsBudget", { amount: facts.budgetPerDayEur })}
          </li>
        </ul>
      </section>
    </div>
  );
}
