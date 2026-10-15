import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { FlightSearch } from "@/components/flights/flight-search";
import { ClearOnboardingDraft } from "@/components/onboarding/onboarding-flow";
import { ProposalCard } from "@/components/proposals/proposal-card";
import { proposalTexts } from "@/components/proposals/proposal-texts";
import { isSicilyAirport } from "@/lib/flights/airports";
import { redirect } from "@/lib/i18n/navigation";
import { getUser } from "@/server/auth";
import { driveTimesBySlug, engineCatalog, getSavedPreferences, toProfile } from "@/server/personalization/data";
import { proposeTrips } from "@/server/personalization/engine";

// "Ecco tre viaggi pensati per te" (schemi.md): tre proposte costruite dal catalogo dal
// motore (server/personalization/engine.ts), una per area di viaggio, ognuna con il perché
// dell'area e ogni tappa con "Per te" e i suoi motivi. Se l'utente non ha scelto interessi
// ("Salta" ovunque) i viaggi sono un punto di partenza: la pagina lo dice e non mostra "Per te".
// Le proposte si calcolano a ogni visita dalle risposte salvate; "Salva questo viaggio" porta a
// /viaggio/salva (date e persone), che le ricalcola sul server e crea l'itinerario. Non indicizzata.
// Le card sono in components/proposals (condivise con la pagina del gruppo).
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Proposals" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ProposalsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getUser();
  const saved = user ? await getSavedPreferences(user) : null;
  if (!saved?.completed) return redirect({ href: "/viaggio/nuovo", locale });

  const [t, texts, catalog, driveTimes] = await Promise.all([
    getTranslations("Proposals"),
    proposalTexts(locale),
    engineCatalog(),
    driveTimesBySlug(),
  ]);
  const profile = toProfile(saved);
  // Se nessuna area copre i giorni scelti: i viaggi sul massimo di giorni coperto, e lo diciamo.
  const { proposals, days: coveredDays, shortened } = proposeTrips(catalog, profile, driveTimes);
  const personal = Object.values(saved.weights).some((w) => w > 0);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-16 md:py-14">
      <ClearOnboardingDraft />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="is-display text-display-l">{personal ? t("title") : t("titleGeneric")}</h1>
          <p className="mt-3 text-body-l text-pretty text-lava-muted">{personal ? t("intro") : t("introGeneric")}</p>
        </div>
        {/* Due link distinti (M4 parte 5): il viaggio di questa volta e i gusti di sempre. */}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/viaggio/nuovo" variant="secondary">
            {t("changeTrip")}
          </ButtonLink>
          <ButtonLink href="/preferenze" variant="secondary">
            {t("editTastes")}
          </ButtonLink>
        </div>
      </div>

      {/* Barra voli (passo 2.1): l'arrivo è quello del profilo, se è un aeroporto siciliano. */}
      <section aria-labelledby="proposte-voli" className="mt-10 flex flex-col gap-4">
        <div className="max-w-2xl">
          <h2 id="proposte-voli" className="is-display text-heading-2">
            {t("flightsBarTitle")}
          </h2>
          <p className="mt-2 text-body text-pretty text-lava-muted">{t("flightsBarText")}</p>
        </div>
        <FlightSearch
          variant="compact"
          initial={{
            origin: null,
            destination: saved.airport && isSicilyAirport(saved.airport) ? saved.airport : null,
            departure: null,
            returnDate: null,
            passengers: 1,
            itineraryId: null,
          }}
        />
      </section>

      {shortened && (
        <p role="note" className="mt-8 rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {t("shortened", { days: coveredDays })}
        </p>
      )}

      {proposals.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-body-l">{t("empty")}</p>
          <ButtonLink href="/viaggio/nuovo" variant="primary">
            {t("changeTrip")}
          </ButtonLink>
        </div>
      ) : (
        <ol className="mt-10 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {proposals.map((proposal, i) => (
            <ProposalCard
              key={`${proposal.area}:${proposal.variant ?? ""}`}
              proposal={proposal}
              index={i}
              texts={texts}
              whyKind={personal ? "personal" : null}
              rentalCar={saved.car === "rental"}
              showSave
              level={2}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
