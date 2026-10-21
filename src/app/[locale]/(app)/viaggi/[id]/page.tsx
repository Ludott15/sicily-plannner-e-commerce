import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { TripGroupPanel } from "@/components/groups/trip-group-panel";
import { TripGroupSections } from "@/components/groups/trip-group-sections";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/layout/tabs";
import { AnnounceOnLoad } from "@/components/trips/announce-on-load";
import { TripActions } from "@/components/trips/trip-actions";
import { TripBuilder, type BuilderBooking, type BuilderDay } from "@/components/trips/trip-builder";
import { assignStopPhotos } from "@/lib/itinerary-photos";
import { coverThumbUrl, type CoverMedia } from "@/lib/media";
import { TodayPanel } from "@/components/trips/today-panel";
import { romeToday } from "@/lib/trip-days";
import { TRIP_TABS, type TripTab } from "@/lib/trip-tabs";
import { tripDayIndex } from "@/lib/trip-today";
import { formatDuration } from "@/lib/format";
import { flightSearchPath, MAX_PASSENGERS } from "@/lib/flights/search-params";
import { consecutiveLegPairs } from "@/lib/maps/legs";
import { activeTab } from "@/lib/tabs";
import { bookingEntries } from "@/lib/trips";
import { partnerName, type Partner } from "@/server/affiliates/links";
import { getPartnerConfig, VERTICAL_PARTNER } from "@/server/affiliates/partners";
import { requireUser } from "@/server/auth";
import { getGroup } from "@/server/groups/queries";
import { getTripGroupState } from "@/server/groups/trip-group";
import { chatStatus } from "@/server/chat/queries";
import { getLegs } from "@/server/maps/legs";
import { getTrip, getTripVerticalChips, type VerticalChip } from "@/server/trips/queries";

// Pagina del viaggio (M5, 1.4; riprogettata in 6.1). Solo il proprietario o i membri del gruppo la aprono:
// getTrip legge con dbAsUser, quindi per chiunque altro il viaggio non esiste (404). Il nome di un giorno
// è il titolo scelto o ereditato; senza titolo, i luoghi delle sue tappe. Le schede stanno in ?scheda=
// (itinerario di default, poi prenotare e gruppo); il giorno resta in ?giorno=.
type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ giorno?: string; scheda?: string }>;
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TripPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [trip, t, tAff, tVert, format, { giorno, scheda }, chips, lodgingPartner, carPartner, chat] = await Promise.all([
    getTrip(user, id),
    getTranslations("Trips"),
    getTranslations("Affiliates"),
    getTranslations("Verticals"),
    getFormatter(),
    searchParams,
    getTripVerticalChips(user, id, locale),
    getPartnerConfig(VERTICAL_PARTNER.lodging),
    getPartnerConfig(VERTICAL_PARTNER.car),
    chatStatus(user),
  ]);
  if (!trip) notFound();
  // Gruppo del viaggio (4.1): il nome serve al link. Il viaggio è di chi lo apre, o di un membro.
  const group = trip.groupId ? await getGroup(user, trip.groupId) : null;
  // Stato del gruppo (4.2): voti, alternative, proposte e modifiche di questo viaggio.
  const groupState = group ? await getTripGroupState(user, id, group.id) : null;

  const tab = activeTab(TRIP_TABS, scheda) as TripTab;

  // "Oggi" (passo 11.3): le tappe di tutti i giorni vanno al client, che sceglie il giorno con la data
  // di oggi del browser. Il server calcola lo stesso giorno per il primo render (initialDayIndex).
  const todayStops = trip.stops.map((s) => ({
    id: s.id,
    dayIndex: s.dayIndex,
    position: s.position,
    title: s.title,
    placeName: s.placeName,
    timeSlot: s.timeSlot,
    lat: s.lat,
    lng: s.lng,
    checkIn: s.placeId !== null && !user.is_anonymous ? { checkedInToday: s.checkedInToday } : null,
  }));
  const today = (
    <TodayPanel
      startDate={trip.startDate}
      days={trip.days}
      initialDayIndex={tripDayIndex(trip.startDate, trip.days, romeToday(new Date()))}
      stops={todayStops}
    />
  );

  // Una foto per tappa, senza ripetizioni in tutto il viaggio (docs/IMMAGINI.md): copertina propria
  // dell'attività → del luogo → dell'area. Le tappe arrivano già in ordine di giorno e posizione.
  const stopPhotos = assignStopPhotos(
    trip.stops.map((s) => ({ key: s.id, chain: [s.activityCover?.id ?? null, s.placeCover?.id ?? null, s.areaCover?.id ?? null] })),
  );
  const mediaById = new Map<string, CoverMedia>();
  for (const s of trip.stops) {
    for (const cover of [s.activityCover, s.placeCover, s.areaCover]) {
      if (cover) mediaById.set(cover.id, cover);
    }
  }
  const thumbFor = (stopId: string): string | null => {
    const id = stopPhotos.get(stopId) ?? null;
    const cover = id === null ? undefined : mediaById.get(id);
    return cover ? coverThumbUrl(cover) : null;
  };

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
        // Coordinate del luogo, per la mappa del giorno (6.2).
        lat: s.lat,
        lng: s.lng,
        placeId: s.placeId,
        // Miniatura della foto assegnata alla tappa (vedi sopra).
        thumbUrl: thumbFor(s.id),
      })),
    };
  });
  // Tratte stradali tra le tappe consecutive di ogni giorno (place_legs; le mancanti sono "in calcolo").
  const legs = await getLegs(days.flatMap((day) => consecutiveLegPairs(day.stops.map((stop) => stop.placeId))));

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

  const tabs = [
    { id: "itinerario", label: t("v2.tabItinerary") },
    { id: "prenotare", label: t("v2.tabBookings") },
    { id: "gruppo", label: t("v2.tabGroup") },
  ] as const;

  // Scheda del gruppo: il pannello del gruppo (creazione, invito o link) e, se c'è, proposte e modifiche.
  const groupTab = (
    <div className="flex flex-col gap-8">
      <TripGroupPanel
        locale={locale}
        tripId={trip.id}
        tripTitle={trip.title}
        group={group ? { id: group.id, name: group.name } : null}
        isOwner={trip.ownerId === user.id}
        isGuest={Boolean(user.is_anonymous)}
      />
      {groupState && (
        <TripGroupSections proposals={groupState.proposals} changes={groupState.changes} isGroupOwner={groupState.isGroupOwner} />
      )}
      {!group && trip.ownerId !== user.id && !user.is_anonymous && (
        <p className="text-body text-lava-muted">{t("v2.groupNone")}</p>
      )}
    </div>
  );

  // Il gruppo del viaggio compare come percorso: gruppo → viaggio.
  const crumbs = group
    ? { breadcrumb: [{ label: group.name, href: `/gruppi/${group.id}` }], breadcrumbLabel: t("v2.breadcrumbLabel") }
    : {};

  return (
    <PageContainer width="work" className="is-trip-page">
      <PageHeader
        title={trip.title}
        eyebrow={t("eyebrow")}
        meta={meta.join(" · ")}
        menu={
          <>
            <ChatLauncher
              itineraryId={trip.id}
              title={trip.title}
              enabled={chat.enabled}
              remainingToday={chat.remainingToday}
              limit={chat.limit}
            />
            <TripActions
              locale={locale}
              tripId={trip.id}
              title={trip.title}
              startDate={trip.startDate}
              travelers={trip.travelers}
              pace={trip.pace}
              sharedSince={sharedSince}
            />
          </>
        }
        {...crumbs}
      />
      <div className="flex flex-col gap-6">
        <AnnounceOnLoad />
        <div className="is-trip-tools">
          <Tabs idPrefix="trip" label={t("v2.tabsLabel")} tabs={tabs} value={tab} />
        </div>
        <TripBuilder
          tripId={trip.id}
          days={days}
          legs={legs}
          warnings={trip.warnings}
          initialDay={(Number(giorno) || 1) - 1}
          bookings={bookings}
          group={groupState}
          tab={tab}
          groupTab={groupTab}
          today={today}
        />
      </div>
    </PageContainer>
  );
}
