import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { TripGroupPanel } from "@/components/groups/trip-group-panel";
import { TripGroupSections } from "@/components/groups/trip-group-sections";
import { TripBuilder, type BuilderBooking, type BuilderDay } from "@/components/trips/trip-builder";
import { formatDuration } from "@/lib/format";
import { flightSearchPath, MAX_PASSENGERS } from "@/lib/flights/search-params";
import { bookingEntries } from "@/lib/trips";
import { partnerName, type Partner } from "@/server/affiliates/links";
import { getPartnerConfig, VERTICAL_PARTNER } from "@/server/affiliates/partners";
import { requireUser } from "@/server/auth";
import { getGroup } from "@/server/groups/queries";
import { getTripGroupState } from "@/server/groups/trip-group";
import { getTrip, getTripVerticalChips, type VerticalChip } from "@/server/trips/queries";

// Pagina del viaggio (M5, 1.4). Solo il proprietario o i membri del gruppo la aprono: getTrip
// legge con dbAsUser, quindi per chiunque altro il viaggio non esiste (404). Il nome di un giorno
// è il titolo scelto o ereditato; senza titolo, i luoghi delle sue tappe.
type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ giorno?: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TripPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [trip, t, tAff, tVert, format, { giorno }, chips, lodgingPartner, carPartner] = await Promise.all([
    getTrip(user, id),
    getTranslations("Trips"),
    getTranslations("Affiliates"),
    getTranslations("Verticals"),
    getFormatter(),
    searchParams,
    getTripVerticalChips(user, id, locale),
    getPartnerConfig(VERTICAL_PARTNER.lodging),
    getPartnerConfig(VERTICAL_PARTNER.car),
  ]);
  if (!trip) notFound();
  // Gruppo del viaggio (4.1): il nome serve al link. Il viaggio è di chi lo apre, o di un membro.
  const group = trip.groupId ? await getGroup(user, trip.groupId) : null;
  // Stato del gruppo (4.2): voti, alternative, proposte e modifiche di questo viaggio.
  const groupState = group ? await getTripGroupState(user, id, group.id) : null;

  const days: BuilderDay[] = Array.from({ length: trip.days }, (_, d) => {
    const stops = trip.stops.filter((s) => s.dayIndex === d);
    const places = [...new Set(stops.flatMap((s) => (s.placeName ? [s.placeName] : [])))];
    return {
      name: trip.dayTitles[d]?.trim() || places.join(" e ") || t("dayEmptyName"),
      note: trip.dayNotes[d]?.trim() ?? "",
      stops: stops.map((s) => ({
        id: s.id,
        title: s.title,
        href: s.activitySlug ? `/attivita/${s.activitySlug}` : null,
        meta: [s.placeName, s.durationMin ? formatDuration(s.durationMin) : null].filter(Boolean).join(" · "),
        timeSlot: s.timeSlot,
        notes: s.notes,
        // "Sono qui" (passo 5.1): solo tappe con un luogo, mai per gli ospiti.
        checkIn: s.placeId !== null && !user.is_anonymous ? { checkedInToday: s.checkedInToday } : null,
      })),
    };
  });

  // Voli (passo 2.1): la ricerca parte con date e persone del viaggio; l'arrivo è quello del profilo.
  const travelers = trip.travelers !== null && trip.travelers >= 1 && trip.travelers <= MAX_PASSENGERS ? trip.travelers : 1;
  const flightSearchHref = flightSearchPath(locale, {
    departure: trip.startDate,
    passengers: travelers,
    itineraryId: trip.id,
  });

  const slugByActivity = new Map(
    trip.stops.flatMap((s) => (s.activityId && s.activitySlug ? [[s.activityId, s.activitySlug] as const] : [])),
  );

  // Alloggio e noleggio (passo 3.1): link firmato se il partner è pronto, "in arrivo" se no, la
  // spiegazione di cosa manca se il viaggio non ha ancora zona, date o aeroporto.
  const chipFields = (
    kind: "lodging" | "car",
    chip: VerticalChip | null,
  ): Pick<BuilderBooking, "searchAction" | "pending" | "note"> => {
    const partner = kind === "lodging" ? lodgingPartner : carPartner;
    const label = t(kind === "lodging" ? "chooseLodging" : "compareCars");
    if (chip?.status === "ready" && chip.href) {
      return {
        searchAction: { href: chip.href, label },
        pending: null,
        note: partner ? tAff("disclosure", { partner: partner.name }) : null,
      };
    }
    if (chip?.status === "coming_soon") {
      return {
        searchAction: null,
        pending: { id: kind === "lodging" ? "vertical.lodging" : "vertical.car", label },
        note: tVert("comingSoon"),
      };
    }
    return { searchAction: null, pending: null, note: t(kind === "lodging" ? "lodgingMissing" : "carMissing") };
  };

  const bookings: BuilderBooking[] = bookingEntries(
    trip.stops,
    trip.offers.map((o) => ({ activityId: o.activityId, partner: o.partner })),
    trip.bookings,
  ).map((e): BuilderBooking => {
    const common = { id: e.key, kind: e.kind, activityId: e.activityId, done: e.done, href: null };
    if (e.kind === "activity") {
      const slug = e.activityId ? (slugByActivity.get(e.activityId) ?? null) : null;
      return {
        ...common,
        name: e.title!,
        partner: e.partner ? partnerName(e.partner as Partner) : null,
        searchAction: slug ? { href: `/attivita/${slug}`, label: t("openActivity") } : null,
        pending: null,
        note: null,
      };
    }
    if (e.kind === "lodging" || e.kind === "car") {
      return {
        ...common,
        name: t(`booking.${e.kind}`),
        partner: null,
        ...chipFields(e.kind, e.kind === "lodging" ? chips?.lodging ?? null : chips?.car ?? null),
      };
    }
    return {
      ...common,
      name: t(`booking.${e.kind}`),
      partner: null,
      searchAction: { href: flightSearchHref, label: t("flightSearchAction") },
      pending: null,
      note: null,
    };
  });

  const meta = [
    trip.startDate ? t("from", { date: format.dateTime(new Date(`${trip.startDate}T12:00:00`), { dateStyle: "long" }) }) : t("noDates"),
    trip.travelers ? t("travelersOption", { count: trip.travelers }) : null,
    t("daysCount", { count: trip.days }),
  ].filter(Boolean);

  const sharedSince = trip.activeShareLink
    ? format.dateTime(new Date(trip.activeShareLink.createdAt), { dateStyle: "long" })
    : null;

  return (
    <section className="is-trip-page mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-16 md:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
        <h1 className="is-display text-display-l">{trip.title}</h1>
        <p className="text-body text-lava-muted">{meta.join(" · ")}</p>
      </header>
      <TripGroupPanel
        locale={locale}
        tripId={trip.id}
        tripTitle={trip.title}
        group={group ? { id: group.id, name: group.name } : null}
        isOwner={trip.ownerId === user.id}
        isGuest={Boolean(user.is_anonymous)}
      />
      {groupState && (
        <TripGroupSections
          proposals={groupState.proposals}
          changes={groupState.changes}
          isGroupOwner={groupState.isGroupOwner}
        />
      )}
      <TripBuilder
        locale={locale}
        tripId={trip.id}
        title={trip.title}
        startDate={trip.startDate}
        travelers={trip.travelers}
        pace={trip.pace}
        days={days}
        warnings={trip.warnings}
        initialDay={(Number(giorno) || 1) - 1}
        bookings={bookings}
        sharedSince={sharedSince}
        group={groupState}
      />
    </section>
  );
}
