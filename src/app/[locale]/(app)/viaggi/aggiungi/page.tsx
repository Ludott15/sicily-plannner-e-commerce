import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { AddToTripForm } from "@/components/trips/add-to-trip-form";
import { Link } from "@/lib/i18n/navigation";
import { requireUser } from "@/server/auth";
import { getGroup } from "@/server/groups/queries";
import { getActivity } from "@/server/catalog/queries";
import { areaNames } from "@/server/personalization/data";
import { placeArea, tripsForPicker } from "@/server/trips/queries";

// "Aggiungi al viaggio" dalla scheda attività (?attivita=<slug>): scelta del viaggio e del
// giorno, con il giorno compatibile per area già proposto. Senza viaggi: "Crea il tuo viaggio".
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ attivita?: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AddToTripPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { attivita } = await searchParams;
  if (!attivita || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(attivita)) notFound();
  const user = await requireUser();
  const activity = await getActivity(attivita);
  if (!activity) notFound();
  const [t, pickerTrips, area, names] = await Promise.all([
    getTranslations("Trips"),
    tripsForPicker(user),
    placeArea(user, activity.placeId),
    areaNames(locale),
  ]);
  // Viaggi di gruppo (4.2): chi non è il proprietario del gruppo propone la tappa invece di aggiungerla.
  const trips = await Promise.all(
    pickerTrips.map(async (trip) => {
      if (!trip.groupId) return trip;
      const group = await getGroup(user, trip.groupId);
      return { ...trip, isGroupOwner: group?.isOwner ?? false };
    }),
  );

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-display-l">{t("addTitle")}</h1>
        <p className="text-body-l text-lava-muted">
          <Link href={`/attivita/${activity.slug}`}>{activity.title}</Link> · {activity.placeName}
        </p>
      </div>
      {trips.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body-l">{t("noTripsYet")}</p>
          <ButtonLink href="/viaggio/nuovo" variant="primary">
            {t("createTrip")}
          </ButtonLink>
        </div>
      ) : (
        <AddToTripForm
          locale={locale}
          activityId={activity.id}
          activityArea={area}
          areaNames={Object.fromEntries(names)}
          trips={trips}
        />
      )}
    </section>
  );
}
