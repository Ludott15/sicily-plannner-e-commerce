"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { ItineraryStop } from "@/components/design";
import { ActionMenu, type ActionMenuItem } from "@/components/layout/action-menu";
import type { TimeSlot } from "@/lib/itinerary-checks";
import { cn } from "@/lib/utils";
import { StopNoteDialog } from "./trip-notes";

// Pezzi del trascinamento del builder (brief 6.1). Le tappe del giorno visibile sono elementi ordinabili
// (useSortable: il nodo è la riga dei controlli, la maniglia è il pulsante di trascinamento); le zone dei
// giorni sono bersagli di rilascio (useDroppable). Su mobile la tappa mostra solo il titolo, il luogo, i
// voti e il menu ⋯: su, giù, sposta al giorno, nota e rimozione stanno nel menu. Il trascinamento
// (maniglia) è solo da md in su.

export function DayDropZone({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-calce-sunk")}>
      {children}
    </div>
  );
}

// Le zone degli altri giorni restano montate (dnd-kit le misura all'avvio del trascinamento, anche da
// tastiera), ma a riposo sono discrete: piccole e attenuate. Durante un trascinamento tornano piene.
export function DayDropZones({ className, children }: { className?: string; children: ReactNode }) {
  const { active } = useDndContext();
  return (
    <div className={cn(className, "transition-opacity motion-reduce:transition-none", active ? "opacity-100" : "opacity-50 text-body-s")}>
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
  /** Voti del gruppo sulla tappa (solo nei viaggi di gruppo), sotto il luogo. */
  votes?: ReactNode;
  /** "Sono qui" con il check-in (passo 5.1): azione secondaria, solo se la tappa ha un luogo e chi guarda non è ospite. */
  checkIn?: ReactNode;
};

// Una tappa nella lista del giorno: la scheda (ItineraryStop) con orario, titolo, luogo e durata; sotto,
// il check-in (se c'è) a sinistra e a destra la maniglia e il menu ⋯ con le altre azioni.
export function StopItem({
  stop,
  dayIndex,
  dayCount,
  index,
  count,
  pending,
  onStep,
  onMoveToDay,
  onRemove,
  votes,
  checkIn,
}: StopItemProps) {
  const t = useTranslations("Trips");
  const { attributes, listeners, setNodeRef } = useSortable({ id: stop.id });
  const [noteOpen, setNoteOpen] = useState(false);
  const slotLabel = stop.timeSlot ? t(`timeSlot.${stop.timeSlot}`) : undefined;

  const moveToDayItems: ActionMenuItem[] = Array.from({ length: dayCount }, (_, day) => day)
    .filter((day) => day !== dayIndex)
    .map((day): ActionMenuItem => ({
      kind: "button",
      label: t("v2.menuMoveToDay", { n: day + 1 }),
      disabled: pending,
      onSelect: () => onMoveToDay(day),
    }));

  const items: ActionMenuItem[] = [
    { kind: "button", label: t("v2.menuMoveUp"), disabled: pending || index === 0, onSelect: () => onStep(-1) },
    { kind: "button", label: t("v2.menuMoveDown"), disabled: pending || index === count - 1, onSelect: () => onStep(1) },
    ...moveToDayItems,
    { kind: "separator" },
    { kind: "button", label: t("v2.menuStopNote"), icon: "pencil", onSelect: () => setNoteOpen(true) },
    { kind: "button", label: t("v2.menuRemoveStop"), icon: "trash", danger: true, disabled: pending, onSelect: onRemove },
  ];

  return (
    <ItineraryStop time={slotLabel} title={stop.title} href={stop.href ?? undefined} meta={stop.meta} votes={votes}>
      {stop.notes && <p className="is-trip-print-note mt-2 text-body-s text-lava-muted">{stop.notes}</p>}
      <div ref={setNodeRef} className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-busy={pending}>
        <div className="min-w-0">{checkIn}</div>
        <div className="is-trip-tools ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label={t("dragHandle", { title: stop.title })}
            className="hidden size-11 shrink-0 touch-none items-center justify-center rounded-sm text-lava-muted hover:text-lava focus-visible:outline-2 focus-visible:outline-focus md:inline-flex"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <ActionMenu variant="more" label={t("v2.stopActions", { title: stop.title })} items={items} />
        </div>
      </div>
      <StopNoteDialog
        open={noteOpen}
        title={t("stopNote")}
        onClose={() => setNoteOpen(false)}
        stopId={stop.id}
        timeSlot={stop.timeSlot}
        notes={stop.notes}
      />
    </ItineraryStop>
  );
}
