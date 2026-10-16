import { ButtonLink, ItineraryStop, Route } from "@/components/design";
import { formatDriveTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/server/personalization/engine";
import type { ProposalTexts } from "./proposal-texts";

// Una proposta di viaggio (un'area o una coppia di aree): titolo, perché della zona, auto se
// serve, giorni con le tappe e il perché di ogni tappa. Usata da /viaggio/proposte ("Per te")
// e dalla pagina del gruppo ("Per il gruppo"). Solo server: non ha stato né interattività.
// layout "wide" (default "compact", la card del gruppo non cambia): a tutta larghezza, in una
// carta con titolo, "Salva questo viaggio" accanto al titolo, il perché in evidenza e le tappe
// giorno per giorno sotto.
export type ProposalCardProps = {
  proposal: Proposal;
  // Posizione nella lista, da 0: il titolo dice "Viaggio 1", "Viaggio 2"…
  index: number;
  texts: ProposalTexts;
  // Intestazione del perché di ogni tappa: "personal" = "Per te", "group" = "Per il gruppo",
  // null = nessun motivo sulle tappe.
  whyKind: "personal" | "group" | null;
  // L'utente ha scelto l'auto a noleggio: l'avviso lo dice. Nel gruppo non si sa: false.
  rentalCar: boolean;
  // Bottone "Salva questo viaggio" (solo per i viaggi personali: il gruppo non salva qui).
  showSave: boolean;
  // Livello del titolo della card: 2 nella pagina proposte, 3 sotto la sezione del gruppo.
  level: 2 | 3;
  // Variante della card: "compact" (gruppo, default) o "wide" (pagina proposte, a tutta larghezza).
  layout?: "compact" | "wide";
};

export function ProposalCard({
  proposal,
  index,
  texts,
  whyKind,
  rentalCar,
  showSave,
  level,
  layout = "compact",
}: ProposalCardProps) {
  const { t, areaTitle, reasonText, areaReasonTexts } = texts;
  const wide = layout === "wide";
  const Title = level === 2 ? "h2" : "h3";
  const Sub = level === 2 ? "h3" : "h4";
  const saveHref = `/viaggio/salva?area=${encodeURIComponent(proposal.area)}${proposal.variant ? `&variante=${proposal.variant}` : ""}`;
  const save = showSave ? (
    <ButtonLink href={saveHref} variant="primary" size={wide ? "md" : "sm"}>
      {t("saveTrip")}
    </ButtonLink>
  ) : null;
  const title = t("proposalTitle", { n: index + 1, area: areaTitle(proposal.areas) });
  const meta = t("proposalMeta", { days: proposal.days.length });

  return (
    <li
      className={cn(
        "flex flex-col",
        wide ? "gap-8 rounded-lg border border-card-edge bg-calce-raised p-5 shadow-card md:p-8" : "gap-4",
      )}
      data-area={proposal.area}
    >
      {wide ? (
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="flex min-w-0 flex-col gap-2">
            <Title className="is-display text-heading-2 text-balance">{title}</Title>
            <p className="text-body-s text-lava-muted">{meta}</p>
          </div>
          {save && <div className="shrink-0">{save}</div>}
        </div>
      ) : (
        <>
          <Title className="is-display text-heading-1">{title}</Title>
          <p className="text-body-s text-lava-muted">{meta}</p>
          {save && <div>{save}</div>}
        </>
      )}

      <div className={cn("flex flex-col", wide ? "gap-2" : "gap-1")}>
        <Sub className={wide ? "text-body font-semibold" : "text-label uppercase text-lava-muted"}>{t("whyArea")}</Sub>
        <ul className={cn("flex list-disc flex-col pl-5", wide ? "gap-2 text-body" : "gap-1 text-body-s")}>
          {proposal.reasons.flatMap(areaReasonTexts).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>

      {proposal.needsCar &&
        (wide ? (
          // Auto a noleggio: la pagina dei noleggi dice se il partner è pronto ("in arrivo" fino alla M6-partner).
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
            <p className="text-body">{rentalCar ? t("needsRentalCar") : t("needsCar")}</p>
            <ButtonLink href="/noleggio-auto" variant="secondary" size="sm">
              {t("rentCar")}
            </ButtonLink>
          </div>
        ) : (
          // Auto a noleggio: la pagina dei noleggi dice se il partner è pronto ("in arrivo" fino alla M6-partner).
          <div className="flex flex-col items-start gap-2 rounded-lg border border-card-edge bg-calce-raised p-4">
            <p className="text-body-s">{rentalCar ? t("needsRentalCar") : t("needsCar")}</p>
            <ButtonLink href="/noleggio-auto" variant="secondary" size="sm">
              {t("rentCar")}
            </ButtonLink>
          </div>
        ))}

      <div className={cn("flex flex-col", wide ? "gap-8 border-t border-divider pt-6" : "gap-4")}>
        {proposal.days.map((day, d) => (
          <div key={d} className="flex flex-col gap-2">
            <Sub className="text-body font-semibold">
              {t("day", { n: d + 1, places: [...new Set(day.activities.map((a) => a.placeName))].join(", ") })}
            </Sub>
            {proposal.transfer?.dayIndex === d && (
              <p className="text-body-s text-lava-muted">{t("transferDay", { duration: formatDriveTime(proposal.transfer.minutes) })}</p>
            )}
            <Route>
              {day.activities.map((a) => (
                <ItineraryStop
                  key={a.id}
                  title={a.title}
                  href={`/attivita/${a.slug}`}
                  meta={`${a.placeName} · ${formatDuration(a.durationMin)}`}
                  why={whyKind && a.reasons.length > 0 ? { kind: whyKind, reasons: a.reasons.map(reasonText) } : undefined}
                >
                  {a.dietChecked && <p className="text-body-s text-lava-muted">{t("dietNote")}</p>}
                </ItineraryStop>
              ))}
            </Route>
          </div>
        ))}
      </div>
    </li>
  );
}
