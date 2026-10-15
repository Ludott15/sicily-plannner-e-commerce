import { ButtonLink, ItineraryStop, Route } from "@/components/design";
import { formatDriveTime, formatDuration } from "@/lib/format";
import type { Proposal } from "@/server/personalization/engine";
import type { ProposalTexts } from "./proposal-texts";

// Una proposta di viaggio (un'area o una coppia di aree): titolo, perché della zona, auto se
// serve, giorni con le tappe e il perché di ogni tappa. Usata da /viaggio/proposte ("Per te")
// e dalla pagina del gruppo ("Per il gruppo"). Solo server: non ha stato né interattività.
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
};

export function ProposalCard({ proposal, index, texts, whyKind, rentalCar, showSave, level }: ProposalCardProps) {
  const { t, areaTitle, reasonText, areaReasonTexts } = texts;
  const Title = level === 2 ? "h2" : "h3";
  const Sub = level === 2 ? "h3" : "h4";
  const saveHref = `/viaggio/salva?area=${encodeURIComponent(proposal.area)}${proposal.variant ? `&variante=${proposal.variant}` : ""}`;

  return (
    <li className="flex flex-col gap-4" data-area={proposal.area}>
      <Title className="is-display text-heading-1">{t("proposalTitle", { n: index + 1, area: areaTitle(proposal.areas) })}</Title>
      <p className="text-body-s text-lava-muted">{t("proposalMeta", { days: proposal.days.length })}</p>
      {showSave && (
        <div>
          <ButtonLink href={saveHref} variant="primary" size="sm">
            {t("saveTrip")}
          </ButtonLink>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Sub className="text-label uppercase text-lava-muted">{t("whyArea")}</Sub>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-s">
          {proposal.reasons.flatMap(areaReasonTexts).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
      {proposal.needsCar && (
        // Auto a noleggio: la pagina dei noleggi dice se il partner è pronto ("in arrivo" fino alla M6-partner).
        <div className="flex flex-col items-start gap-2 rounded-lg border border-card-edge bg-calce-raised p-4">
          <p className="text-body-s">{rentalCar ? t("needsRentalCar") : t("needsCar")}</p>
          <ButtonLink href="/noleggio-auto" variant="secondary" size="sm">
            {t("rentCar")}
          </ButtonLink>
        </div>
      )}
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
    </li>
  );
}
