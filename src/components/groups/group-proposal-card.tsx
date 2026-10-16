import "server-only";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ButtonLink, ItineraryStop, Route } from "@/components/design";
import type { ProposalTexts } from "@/components/proposals/proposal-texts";
import { formatDriveTime, formatDuration } from "@/lib/format";
import type { Proposal } from "@/server/personalization/engine";

// Una proposta del gruppo (brief 6.1, scheda "Viaggi proposti"): a tutta larghezza, una sotto l'altra.
// Titolo, giorni, perché d'area, nota pratica (auto a noleggio). Le tappe stanno in "Vedi le
// tappe" (details, senza JavaScript) e si leggono a una colonna, con il perché di ogni tappa
// "Per il gruppo". Stessi dati e testi di ProposalCard, che resta quella del flusso personale.
export type GroupProposalCardProps = {
  proposal: Proposal;
  // Posizione nella lista, da 0: il titolo dice "Viaggio 1", "Viaggio 2"…
  index: number;
  texts: ProposalTexts;
};

export async function GroupProposalCard({ proposal, index, texts }: GroupProposalCardProps) {
  const { t, areaTitle, reasonText, areaReasonTexts } = texts;
  const tGroups = await getTranslations("Groups");
  const transfer = proposal.transfer;
  const stopCount = proposal.days.reduce((count, day) => count + day.activities.length, 0);

  return (
    <li className="flex flex-col gap-5 pt-10 first:pt-0" data-area={proposal.area}>
      <div className="flex flex-col gap-2">
        <h3 className="is-display text-heading-2 text-balance">
          {t("proposalTitle", { n: index + 1, area: areaTitle(proposal.areas) })}
        </h3>
        <p className="text-body-s text-lava-muted">{t("proposalMeta", { days: proposal.days.length })}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-label uppercase text-lava-muted">{t("whyArea")}</h4>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body">
          {proposal.reasons.flatMap(areaReasonTexts).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>

      {proposal.needsCar && (
        <div className="flex max-w-[680px] flex-col items-start gap-3 rounded-lg bg-calce-sunk p-4">
          <h4 className="text-label uppercase text-lava-muted">{tGroups("v2.practicalNote")}</h4>
          <p className="text-body">{t("needsCar")}</p>
          <ButtonLink href="/noleggio-auto" variant="secondary" size="sm">
            {t("rentCar")}
          </ButtonLink>
        </div>
      )}

      <details className="group border-t border-divider pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-body font-semibold [&::-webkit-details-marker]:hidden">
          <span>{tGroups("v2.seeStops")}</span>
          <span className="flex shrink-0 items-center gap-2 text-body-s font-normal text-lava-muted">
            {tGroups("v2.stopsCount", { count: stopCount })}
            <ChevronDown
              size={18}
              strokeWidth={1.5}
              aria-hidden="true"
              className="shrink-0 transition-transform duration-(--dur-fast) group-open:rotate-180"
            />
          </span>
        </summary>

        <div className="mt-4 flex flex-col gap-6">
          {proposal.days.map((day, d) => (
            <div key={d} className="flex flex-col gap-3">
              <h4 className="text-body font-semibold">
                {t("day", { n: d + 1, places: [...new Set(day.activities.map((a) => a.placeName))].join(", ") })}
              </h4>
              {transfer?.dayIndex === d && (
                <p className="text-body-s text-lava-muted">{t("transferDay", { duration: formatDriveTime(transfer.minutes) })}</p>
              )}
              <Route>
                {day.activities.map((a) => (
                  <ItineraryStop
                    key={a.id}
                    title={a.title}
                    href={`/attivita/${a.slug}`}
                    meta={`${a.placeName} · ${formatDuration(a.durationMin)}`}
                    why={a.reasons.length > 0 ? { kind: "group", reasons: a.reasons.map(reasonText) } : undefined}
                  >
                    {a.dietChecked && <p className="text-body-s text-lava-muted">{t("dietNote")}</p>}
                  </ItineraryStop>
                ))}
              </Route>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}
