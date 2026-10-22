import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ButtonAnchor } from "@/components/design";
import type { VerticalOutcome } from "@/server/affiliates/vertical-page-data";

// Riepilogo della ricerca e esito: il link firmato verso /api/go/v (rel "sponsored noopener") oppure un
// messaggio onesto, secondo quanta ricerca arriva al partner (passesSearch dal backend):
//  - "full": "Cerca su <Partner>";
//  - "place": "Si apre <Partner> su <luogo>: scegli lì le date" (con il luogo della pagina);
//  - "none": "Si apre <Partner>: inserisci lì i dettagli".

export type SummaryItem = { label: string; value: string };

// Avvisi che arrivano dai redirect delle route /api/go/v (link non disponibile, troppi click).
export async function VerticalNotices({ avviso }: { avviso: string }) {
  if (avviso !== "non-disponibile" && avviso !== "troppi-click") return null;
  const t = await getTranslations("Verticals");
  return (
    <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
      {avviso === "non-disponibile" ? t("unavailable") : t("rateLimited")}
    </p>
  );
}

type VerticalResultProps = {
  summary: SummaryItem[];
  outcome: VerticalOutcome | null;
  // Testo quando non c'è ancora un esito (ricerca vuota o incompleta).
  hint: string;
  // Nome del luogo della pagina (zona, città, aeroporto, tratta) per il testo "place".
  placeName?: string;
};

export async function VerticalResult({ summary, outcome, hint, placeName }: VerticalResultProps) {
  const t = await getTranslations("Verticals");
  const tAff = await getTranslations("Affiliates");

  let body: ReactNode;
  if (outcome === null) {
    body = <p className="text-body text-lava-muted">{hint}</p>;
  } else if (outcome.status === "ready") {
    const showPlace = outcome.passesSearch === "place" && placeName !== undefined && placeName !== "";
    body = (
      <div className="flex flex-col items-start gap-3">
        {outcome.passesSearch === "full" ? (
          <ButtonAnchor variant="primary" href={outcome.href} rel="sponsored noopener">
            {t("searchOn", { partner: outcome.partnerName })}
          </ButtonAnchor>
        ) : (
          <>
            <p className="text-body">
              {showPlace
                ? t("opensOnPlace", { partner: outcome.partnerName, place: placeName })
                : t("opensOn", { partner: outcome.partnerName })}
            </p>
            <ButtonAnchor variant="primary" href={outcome.href} rel="sponsored noopener">
              {t("openOn", { partner: outcome.partnerName })}
            </ButtonAnchor>
          </>
        )}
        <p className="text-caption text-lava-muted">{tAff("disclosure", { partner: outcome.partnerName })}</p>
      </div>
    );
  } else {
    body = (
      <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
        {outcome.status === "unavailable" ? t("unavailable") : t("invalid")}
      </p>
    );
  }

  return (
    <section aria-labelledby="vertical-result-title" className="flex flex-col gap-4">
      {summary.length > 0 && (
        <div className="rounded-lg border border-card-edge bg-calce-raised p-5">
          <h2 id="vertical-result-title" className="text-heading-3">
            {t("summaryTitle")}
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {summary.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <dt className="text-caption text-lava-muted">{item.label}</dt>
                <dd className="text-body">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {body}
    </section>
  );
}
