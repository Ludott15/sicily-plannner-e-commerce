"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { ItineraryStop } from "@/components/design";
import type { TimeSlot } from "@/lib/itinerary-checks";
import { cn } from "@/lib/utils";
import { StopNoteForm } from "./trip-notes";
import { controlClass } from "./trip-ui";

// Pezzi del trascinamento del builder. Le tappe del giorno visibile sono elementi ordinabili
// (useSortable, il nodo sono i controlli della tappa); le zone dei giorni sono bersagli di
// rilascio (useDroppable): rilasciare una tappa su una zona la mette in fondo a quel giorno.
// Il trascinamento è solo da md in su: sotto, ci sono i pulsanti su/giù e la scelta del giorno.

const ICON_BUTTON = "inline-flex size-11 items-center justify-center rounded-md text-lava hover:bg-calce-sunk disabled:opacity-40";

export function DayDropZone({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-calce-sunk")}>
      {children}
    </div>
  );
}

export type StopItemProps = {
  stop: { id: string; title: string; href: string | null; meta: string; timeSlot: TimeSlot | null; notes: string | null };
  dayIndex: number;
  dayCount: number;
  index: number;
  count: number;
  pending: boolean;
  onStep: (direction: -1 | 1) => void;
  onMoveToDay: (dayIndex: number) => void;
  onRemove: () => void;
  /** Voti del gruppo sulla tappa (solo nei viaggi di gruppo), sotto la scheda. */
  votes?: ReactNode;
};

// Una tappa nella lista del giorno: la scheda (ItineraryStop) con orario e meta, poi i controlli
// (trascina, su, giù, sposta al giorno, togli) e la nota con la fascia oraria.
export function StopItem({ stop, dayIndex, dayCount, index, count, pending, onStep, onMoveToDay, onRemove, votes }: StopItemProps) {
  const t = useTranslations("Trips");
  const { attributes, listeners, setNodeRef } = useSortable({ id: stop.id });
  const slotLabel = stop.timeSlot ? t(`timeSlot.${stop.timeSlot}`) : undefined;

  return (
    <ItineraryStop time={slotLabel} title={stop.title} href={stop.href ?? undefined} meta={stop.meta} votes={votes}>
      <div ref={setNodeRef} className="is-trip-tools mt-2 flex flex-wrap items-center gap-1" aria-busy={pending}>
        <button
          type="button"
          aria-label={t("dragHandle", { title: stop.title })}
          className="hidden size-11 shrink-0 touch-none items-center justify-center rounded-sm text-lava-muted hover:text-lava md:inline-flex"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={t("moveUp", { title: stop.title })}
          disabled={pending || index === 0}
          onClick={() => onStep(-1)}
        >
          <ArrowUp size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={t("moveDown", { title: stop.title })}
          disabled={pending || index === count - 1}
          onClick={() => onStep(1)}
        >
          <ArrowDown size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        {dayCount > 1 && (
          <select
            aria-label={t("moveToDay", { title: stop.title })}
            value={String(dayIndex)}
            disabled={pending}
            onChange={(event) => onMoveToDay(Number(event.target.value))}
            className={cn(controlClass, "w-auto md:hidden")}
          >
            {Array.from({ length: dayCount }, (_, day) => (
              <option key={day} value={day}>
                {t("moveToDayOption", { n: day + 1 })}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={ICON_BUTTON} aria-label={t("remove", { title: stop.title })} disabled={pending} onClick={onRemove}>
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <StopNoteForm stopId={stop.id} timeSlot={stop.timeSlot} notes={stop.notes} />
    </ItineraryStop>
  );
}
