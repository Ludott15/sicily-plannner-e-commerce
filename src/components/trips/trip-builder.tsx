"use client";

import { flushSync } from "react-dom";
import { useEffect, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent, type ScreenReaderInstructions, MeasuringStrategy } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BookingList, Button, DayTabs, Route, TripMap, type BookingItem } from "@/components/design";
import type { MapPoint } from "@/components/design/map/map-style";
import type { TimeSlot } from "@/lib/itinerary-checks";
import { useRouter } from "@/lib/i18n/navigation";
import { MAX_TRIP_DAYS } from "@/lib/trip-days";
import { dayFromZoneId, dayZoneId, dropOn, locate, placements, stepInDay, type DayOrder } from "@/lib/trip-order";
import { formatDriveTime } from "@/lib/format";
import { tabIds } from "@/lib/tabs";
import type { TripTab } from "@/lib/trip-tabs";
import type { TripWarning } from "@/lib/trip-warnings";
import {
  addDay,
  moveStopTo,
  removeDay,
  removeStop,
  reorderTrip,
  setBookingDone,
  type TripActionError,
  type TripFormState,
} from "@/server/trips/actions";
import { GroupStopVotes, type StopVoteCounts } from "@/components/groups/stop-votes";
import { useItineraryRealtime } from "@/components/groups/use-itinerary-realtime";
import type { TripGroupState } from "@/server/groups/trip-group";
import { ConfirmDialog } from "./confirm-dialog";
import { CheckInButton } from "./check-in-button";
import { DayDropZone, DayDropZones, StopItem } from "./sortable-days";
import { DayNote } from "./trip-notes";
import { FormAlert } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Builder del viaggio (1.4, riprogettato in 6.1). Ogni scheda ha il suo pannello: l'itinerario (giorni con
// le tappe, trascinamento da md in su, menu ⋯ per tappa, nota del giorno in un dialog, avvisi, aggiunta e
// rimozione di un giorno), le cose da prenotare e la scheda del gruppo, già resa dalla pagina. Ogni modifica
// passa dalle azioni server; l'ordine si mostra subito (useOptimistic) e poi si ricarica. In stampa tutti i
// giorni entrano nel documento (beforeprint). Le azioni del viaggio (stampa, duplica, link, impostazioni,
// elimina) stanno nell'intestazione della pagina (TripActions).


export type BuilderStop = {
  id: string;
  title: string;
  href: string | null;
  meta: string;
  timeSlot: TimeSlot | null;
  notes: string | null;
  /** Check-in della tappa: null se non c'è un luogo o chi guarda è ospite (passo 5.1). */
  checkIn: { checkedInToday: boolean } | null;
  /** Coordinate del luogo della tappa (6.2): null se il luogo non ha un punto sulla mappa. */
  lat: number | null;
  lng: number | null;
};

export type BuilderDay = { name: string; note: string; stops: BuilderStop[] };

export type BuilderBooking = BookingItem & { kind: "activity" | "lodging" | "car" | "flight"; activityId: string | null };

export type TripBuilderProps = {
  tripId: string;
  days: BuilderDay[];
  warnings: TripWarning[];
  initialDay: number;
  bookings: BuilderBooking[];
  /** Stato del gruppo (4.2) se il viaggio è di gruppo: voti, alternative, proposte, modifiche. */
  group: TripGroupState | null;
  /** Scheda attiva (da ?scheda=). */
  tab: TripTab;
  /** Contenuto della scheda Gruppo, reso dalla pagina (pannello del gruppo e sezioni). */
  groupTab: ReactNode;
};

const OK: TripFormState = { status: "ok" };
const NO_VOTES: StopVoteCounts = { up: 0, down: 0, mine: null };
const NO_ALTERNATIVES: TripGroupState["alternatives"][string] = [];

type Outcome = { status: "ok" } | TripActionError;

export function TripBuilder({ tripId, days, warnings, initialDay, bookings, group, tab, groupTab }: TripBuilderProps) {
  const t = useTranslations("Trips");
  const tMap = useTranslations("Map");
  const router = useRouter();
  const [picked, setPicked] = useState(initialDay);
  const [error, setError] = useState<TripActionError["code"] | null>(null);
  const [notice, setNotice] = useState("");
  const [printing, setPrinting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const dayCount = days.length;
  const activeDay = Math.min(Math.max(picked, 0), dayCount - 1);

  const serverOrder: DayOrder = days.map((day) => day.stops.map((stop) => stop.id));
  const stopById = new Map(days.flatMap((day) => day.stops).map((stop) => [stop.id, stop] as const));
  const [order, setOrder] = useOptimistic(serverOrder, (_current: DayOrder, next: DayOrder) => next);

  const titleOf = (id: string) => stopById.get(id)?.title ?? "";
  const visibleDays = printing ? days.map((_, d) => d) : [activeDay];
  const visibleIds = visibleDays.flatMap((d) => order[d] ?? []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stampa (Ctrl+P o il menu del viaggio): tutti i giorni nel documento. flushSync rende prima della
  // finestra di stampa; afterprint torna alla vista di un giorno.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Esito di un'azione: errore nel banner, poi dati ricaricati dal server.
  function settle(outcome: Outcome) {
    setError(outcome.status === "error" ? outcome.code : null);
    router.refresh();
  }

  // Ordine nuovo: subito a schermo, poi l'azione. Un messaggio di esito va all'area live.
  function commit(next: DayOrder, run: () => Promise<Outcome>, message?: string) {
    setError(null);
    startTransition(async () => {
      setOrder(next);
      const outcome = await run();
      settle(outcome);
      if (message && outcome.status === "ok") setNotice(message);
    });
  }

  // Trascinamento: tutte le tappe in un colpo (reorderTrip).
  function saveOrder(next: DayOrder, stopId: string) {
    const data = new FormData();
    data.set("tripId", tripId);
    data.set("order", JSON.stringify(placements(next)));
    const at = locate(next, stopId);
    const message = at ? t("moved", { title: titleOf(stopId), day: at.dayIndex + 1, position: at.index + 1 }) : undefined;
    commit(next, () => reorderTrip(data), message);
  }

  // Una tappa sola (su, giù, sposta al giorno): moveStopTo con giorno e posizione d'arrivo.
  function moveOne(stopId: string, next: DayOrder | null) {
    if (!next) return;
    const at = locate(next, stopId);
    if (!at) return;
    const data = new FormData();
    data.set("stopId", stopId);
    data.set("dayIndex", String(at.dayIndex));
    data.set("position", String(at.index));
    commit(next, () => moveStopTo(data), t("moved", { title: titleOf(stopId), day: at.dayIndex + 1, position: at.index + 1 }));
  }

  function step(stopId: string, direction: -1 | 1) {
    moveOne(stopId, stepInDay(order, stopId, direction));
  }

  function moveToDay(stopId: string, day: number) {
    moveOne(stopId, dropOn(order, stopId, dayZoneId(day)));
  }

  function removeStopFromTrip(stopId: string) {
    commit(order, () => removeStop({ itineraryId: tripId, itemId: stopId }));
  }

  function setBooked(id: string, done: boolean) {
    const item = bookings.find((booking) => booking.id === id);
    if (!item) return;
    commit(order, () => setBookingDone({ itineraryId: tripId, kind: item.kind, activityId: item.activityId, done }));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const stopId = String(event.active.id);
    if (!event.over) return;
    const overId = String(event.over.id);
    const next = dropOn(order, stopId, overId);
    if (!next) return;
    const zone = dayFromZoneId(overId);
    if (zone !== null) setPicked(zone);
    saveOrder(next, stopId);
  }

  // Annunci per lo screen reader, in italiano o inglese dai messaggi.
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const stopId = String(active.id);
      const at = locate(order, stopId);
      return at ? t("dragStart", { title: titleOf(stopId), day: at.dayIndex + 1, position: at.index + 1 }) : "";
    },
    onDragOver: ({ active, over }) => {
      if (!over) return "";
      const stopId = String(active.id);
      const overId = String(over.id);
      const zone = dayFromZoneId(overId);
      if (zone !== null) return t("dragOverDay", { title: titleOf(stopId), day: zone + 1 });
      const at = locate(order, overId);
      return at ? t("dragOver", { title: titleOf(stopId), day: at.dayIndex + 1, position: at.index + 1 }) : "";
    },
    onDragEnd: ({ active, over }) => {
      const stopId = String(active.id);
      const next = over ? dropOn(order, stopId, String(over.id)) : null;
      const at = next ? locate(next, stopId) : null;
      return at ? t("dragEnd", { title: titleOf(stopId), day: at.dayIndex + 1, position: at.index + 1 }) : t("dragCancel");
    },
    onDragCancel: () => t("dragCancel"),
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: t("dragInstructions") };

  const addForm = useTripForm<TripFormState>((_prev, formData) => addDay(formData), OK);
  const removeForm = useTripForm<TripFormState>(async (_prev, formData) => {
    const result = await removeDay(formData);
    if (result.status === "ok") setRemoveOpen(false);
    return result;
  }, OK);

  const addAlert = addForm.submitted && addForm.state.status === "error" ? t(`errors.${addForm.state.code}`) : null;
  const removeAlert = removeForm.submitted && removeForm.state.status === "error" ? t(`errors.${removeForm.state.code}`) : null;

  // Il giorno di trasferimento porta l'indice in "day" (come gli altri avvisi in "dayIndex").
  function warningDayIndex(warning: TripWarning): number {
    return warning.code === "transfer_day" ? warning.day : warning.dayIndex;
  }

  function warningText(warning: TripWarning): string {
    if (warning.code === "day_too_long") {
      return t("warnings.dayTooLong", { day: warning.dayIndex + 1, minutes: warning.minutes, limit: warning.limit });
    }
    if (warning.code === "transfer_day") {
      return t("warnings.transferDay", { day: warning.day + 1, duration: formatDriveTime(warning.minutes) });
    }
    return t("warnings.areaChange", { day: warning.dayIndex + 1 });
  }

  const dayNames = days.map((day) => ({ name: day.name }));
  // Punti della mappa: le tappe del giorno con coordinate, numerate come nell'elenco (anche se
  // una tappa senza coordinate lascia un vuoto nella numerazione).
  const mapPoints: MapPoint[] = (order[activeDay] ?? []).flatMap((id, index) => {
    const stop = stopById.get(id);
    if (!stop || stop.lat === null || stop.lng === null) return [];
    return [{ id: stop.id, lat: stop.lat, lng: stop.lng, label: stop.title, number: index + 1 }];
  });
  const mapLabel = tMap("dayMap", { n: activeDay + 1 });
  const ids = tabIds("trip", tab);

  let content: ReactNode;
  if (tab === "prenotare") {
    content = <BookingList items={bookings} onDoneChange={setBooked} />;
  } else if (tab === "gruppo") {
    content = groupTab;
  } else {
    content = (
      <>
        <div className="is-trip-tools">
          <DayTabs days={dayNames} current={activeDay} onSelect={setPicked} />
        </div>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            {/* Mobile: la mappa del giorno sta sotto le pillole, chiusa finché non la si apre. */}
            <details className="is-map-details is-trip-tools md:hidden">
              <summary>{tMap("showMap")}</summary>
              <TripMap points={mapPoints} route ariaLabel={mapLabel} />
            </details>
            <FormAlert message={error ? t(`errors.${error}`) : null} />
            <p aria-live="polite" className="text-body-s text-lava-muted">
              {notice}
            </p>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
              accessibility={{ announcements, screenReaderInstructions }}
              // Le zone dei giorni cambiano aspetto durante il trascinamento: misurarle sempre.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            >
              <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                {visibleDays.map((d) => {
                  const day = days[d];
                  if (!day) return null;
                  const dayStops = (order[d] ?? []).flatMap((id) => {
                    const stop = stopById.get(id);
                    return stop ? [stop] : [];
                  });
                  const dayWarnings = warnings.filter((warning) => warningDayIndex(warning) === d);
                  return (
                    <section key={d} data-day-panel aria-labelledby={`day-title-${d}`} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <h2 id={`day-title-${d}`} className="text-heading-3">
                          {day.name}
                        </h2>
                        <DayNote tripId={tripId} dayIndex={d} note={day.note} />
                      </div>

                      {dayStops.length === 0 ? (
                        <DayDropZone id={dayZoneId(d)} className="rounded-md border border-dashed border-border-control p-4 text-body text-lava-muted">
                          {t("emptyDay")}
                        </DayDropZone>
                      ) : (
                        <div className="max-md:[&_.is-route]:[--stop-time-w:80px]">
                          <Route>
                            {dayStops.map((stop, index) => (
                              <StopItem
                                key={stop.id}
                                stop={stop}
                                dayIndex={d}
                                dayCount={dayCount}
                                index={index}
                                count={dayStops.length}
                                pending={pending}
                                onStep={(direction) => step(stop.id, direction)}
                                onMoveToDay={(target) => moveToDay(stop.id, target)}
                                onRemove={() => removeStopFromTrip(stop.id)}
                                checkIn={
                                  stop.checkIn ? <CheckInButton itemId={stop.id} checkedInToday={stop.checkIn.checkedInToday} /> : undefined
                                }
                                votes={
                                  group ? (
                                    <GroupStopVotes
                                      itemId={stop.id}
                                      votes={group.votes[stop.id] ?? NO_VOTES}
                                      members={group.members}
                                      alternatives={group.alternatives[stop.id] ?? NO_ALTERNATIVES}
                                      isGroupOwner={group.isGroupOwner}
                                    />
                                  ) : undefined
                                }
                              />
                            ))}
                          </Route>
                        </div>
                      )}

                      {dayWarnings.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {dayWarnings.map((warning, i) => (
                            <li key={`${warning.code}-${i}`}>
                              <p role="note" className="rounded-sm border-[1.5px] border-border-control bg-calce-raised px-4 py-3 text-body">
                                {warningText(warning)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}

                      {!printing && d === activeDay && dayCount > 1 && (
                        <DayDropZones className="is-trip-tools hidden flex-col items-stretch gap-2 md:flex">
                          {days.map((_other, k) =>
                            k === d ? null : (
                              <DayDropZone
                                key={k}
                                id={dayZoneId(k)}
                                className="w-full rounded-md border-[1.5px] border-dashed border-border-control px-4 py-2 text-body-s text-lava"
                              >
                                {t("dropOnDay", { n: k + 1 })}
                              </DayDropZone>
                            ),
                          )}
                        </DayDropZones>
                      )}
                    </section>
                  );
                })}
              </SortableContext>
              <DragOverlay>
                {activeId ? (
                  <div className="rounded-md border border-card-edge bg-calce-raised px-4 py-3 text-body shadow-card">{titleOf(activeId)}</div>
                ) : null}
              </DragOverlay>
            </DndContext>

            <div className="is-trip-tools flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <form onSubmit={addForm.submit}>
                  <input type="hidden" name="tripId" value={tripId} />
                  <Button type="submit" variant="secondary" disabled={addForm.pending || dayCount >= MAX_TRIP_DAYS}>
                    {t("addDay")}
                  </Button>
                </form>
                <Button variant="ghost" disabled={dayCount <= 1} onClick={() => setRemoveOpen(true)}>
                  {t("removeDay", { n: activeDay + 1 })}
                </Button>
              </div>
              <FormAlert message={addAlert} />
            </div>

          </div>
        {/* Desktop: colonna laterale, che resta in vista mentre si scorre l'elenco. */}
        <div className="is-trip-aside hidden md:sticky md:top-6 md:block">
          <TripMap points={mapPoints} route ariaLabel={mapLabel} />
        </div>
        </div>

        <ConfirmDialog open={removeOpen} title={t("removeDayTitle", { n: activeDay + 1 })} onClose={() => setRemoveOpen(false)}>
          <form onSubmit={removeForm.submit} className="flex flex-col gap-4" aria-busy={removeForm.pending}>
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="dayIndex" value={activeDay} />
            <p className="text-body">{t("removeDayBody", { n: activeDay + 1 })}</p>
            <FormAlert message={removeAlert} />
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={removeForm.pending}>
                {t("removeDayConfirm")}
              </Button>
            </div>
          </form>
        </ConfirmDialog>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8" aria-busy={pending}>
      {group && <GroupRealtime itineraryId={tripId} />}
      <div id={ids.panel} role="tabpanel" aria-labelledby={ids.tab} className="flex flex-col gap-8">
        {content}
      </div>
    </div>
  );
}

// Tempo reale dei viaggi di gruppo: una modifica di un membro ricarica la pagina (use-itinerary-realtime).
// Il componente resta montato in ogni scheda, così il tempo reale vale anche fuori dall'itinerario.
function GroupRealtime({ itineraryId }: { itineraryId: string }) {
  const subscribed = useItineraryRealtime(itineraryId);
  return <span hidden data-realtime={subscribed ? "subscribed" : "connecting"} />;
}
