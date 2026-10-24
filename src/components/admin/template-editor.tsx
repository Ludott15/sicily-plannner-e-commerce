"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/design";
import type { AdminFormAction, AdminFormState } from "@/lib/admin-form";
import { TIME_SLOTS, type TimeSlot } from "@/lib/itinerary-checks";
import { cn } from "@/lib/utils";
import { Field, FormError, FormNotice, Select, TextArea, TextInput } from "./fields";
import { useAdminForm } from "./use-admin-form";

// Tappe dell'itinerario pronto, giorno per giorno. Si trascinano dentro e tra i giorni (dnd-kit,
// anche da tastiera), con su/giù e con "Sposta al giorno". Ogni spostamento aggiorna subito
// l'elenco (useOptimistic) e salva tutte le tappe con reorderTemplateItems. Fascia oraria e nota
// si salvano con updateTemplateItem, una tappa alla volta. L'aggiunta passa da addTemplateItem.

const DAY_ZONE = "day-";
const NOTE_MAX = 280;

export type EditorItem = {
  id: string;
  dayIndex: number;
  position: number;
  timeSlot: TimeSlot | null;
  notes: string | null;
  label: string;
  activityInactive: boolean;
};

export type EditorActivity = { id: string; title: string; isActive: boolean };
export type EditorPlace = { id: string; name: string };

type Groups = EditorItem[][];

// Tappe raggruppate per giorno, nell'ordine di posizione.
function groupByDay(items: EditorItem[], days: number): Groups {
  const groups: Groups = Array.from({ length: days }, () => []);
  const sorted = [...items].sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position);
  for (const item of sorted) {
    const group = groups[item.dayIndex];
    if (group) group.push(item);
  }
  return groups;
}

// Dai gruppi alla lista piatta, con dayIndex e position rinumerati da 0.
function flatten(groups: Groups): EditorItem[] {
  return groups.flatMap((group, dayIndex) => group.map((item, position) => ({ ...item, dayIndex, position })));
}

function dayZoneId(day: number) {
  return `${DAY_ZONE}${day}`;
}

// Posizione di una tappa per gli annunci: giorno e posizione numerati da 1.
function locate(groups: Groups, id: string): { title: string; day: number; position: number } | null {
  for (let dayIndex = 0; dayIndex < groups.length; dayIndex++) {
    const group = groups[dayIndex] ?? [];
    const index = group.findIndex((item) => item.id === id);
    const item = group[index];
    if (item) return { title: item.label, day: dayIndex + 1, position: index + 1 };
  }
  return null;
}

// Spostamento di un posto su o giù nello stesso giorno (null se è già in cima o in fondo).
function stepInDay(items: EditorItem[], days: number, id: string, step: -1 | 1): EditorItem[] | null {
  const groups = groupByDay(items, days);
  for (const group of groups) {
    const index = group.findIndex((item) => item.id === id);
    if (index === -1) continue;
    const target = index + step;
    if (target < 0 || target >= group.length) return null;
    return flatten(groups.map((g) => (g === group ? arrayMove(g, index, target) : g)));
  }
  return null;
}

// Rilascio di una tappa: su un'altra tappa la si mette al suo posto (nel suo giorno), su una
// zona vuota di un giorno la si mette in fondo a quel giorno.
function dropItem(items: EditorItem[], days: number, activeId: string, overId: string): EditorItem[] | null {
  const groups = groupByDay(items, days);
  const fromDay = groups.findIndex((group) => group.some((item) => item.id === activeId));
  const source = groups[fromDay];
  if (!source) return null;
  const fromIndex = source.findIndex((item) => item.id === activeId);

  let toDay: number;
  let toIndex: number;
  if (overId.startsWith(DAY_ZONE)) {
    toDay = Number(overId.slice(DAY_ZONE.length));
    toIndex = groups[toDay]?.length ?? 0;
  } else {
    toDay = groups.findIndex((group) => group.some((item) => item.id === overId));
    toIndex = groups[toDay]?.findIndex((item) => item.id === overId) ?? -1;
  }
  const target = groups[toDay];
  if (!target || toIndex < 0) return null;

  if (toDay === fromDay) {
    if (toIndex === fromIndex) return null;
    groups[fromDay] = arrayMove(source, fromIndex, toIndex);
  } else {
    const [moved] = source.splice(fromIndex, 1);
    if (!moved) return null;
    target.splice(toIndex, 0, moved);
  }
  return flatten(groups);
}

type EditorProps = {
  locale: string;
  templateId: string;
  days: number;
  dayTitles: string[];
  items: EditorItem[];
  activities: EditorActivity[];
  places: EditorPlace[];
  reorderAction: (formData: FormData) => Promise<AdminFormState>;
  updateAction: AdminFormAction;
  addAction: AdminFormAction;
  removeAction: (formData: FormData) => Promise<void>;
};

export function TemplateEditor({
  locale,
  templateId,
  days,
  dayTitles,
  items,
  activities,
  places,
  reorderAction,
  updateAction,
  addAction,
  removeAction,
}: EditorProps) {
  const t = useTranslations("Admin");
  const [optimistic, setOptimistic] = useOptimistic(items, (_current: EditorItem[], next: EditorItem[]) => next);
  const [feedback, setFeedback] = useState<AdminFormState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const groups = groupByDay(optimistic, days);
  const ids = groups.flat().map((item) => item.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Ordine nuovo: aggiornamento subito, poi il salvataggio di tutte le tappe.
  function commit(next: EditorItem[]) {
    const data = new FormData();
    data.set("locale", locale);
    data.set("templateId", templateId);
    data.set("items", JSON.stringify(next.map((item) => ({ id: item.id, dayIndex: item.dayIndex, position: item.position }))));
    startTransition(async () => {
      setOptimistic(next);
      const result = await reorderAction(data);
      setFeedback(result);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const next = dropItem(optimistic, days, String(active.id), String(over.id));
    if (next) commit(next);
  }

  function step(id: string, direction: -1 | 1) {
    const next = stepInDay(optimistic, days, id, direction);
    if (next) commit(next);
  }

  function moveToDay(id: string, day: number) {
    const next = dropItem(optimistic, days, id, dayZoneId(day));
    if (next) commit(next);
  }

  // Annunci per lo screen reader, in italiano o inglese dai messaggi.
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const info = locate(groups, String(active.id));
      return info ? t("editorDragStart", { title: info.title, day: info.day, position: info.position }) : "";
    },
    onDragOver: ({ active, over }) => {
      const info = locate(groups, String(active.id));
      if (!over || !info) return "";
      const overId = String(over.id);
      if (overId.startsWith(DAY_ZONE)) {
        return t("editorDragOverDay", { title: info.title, day: Number(overId.slice(DAY_ZONE.length)) + 1 });
      }
      const target = locate(groups, overId);
      return target ? t("editorDragOver", { title: info.title, day: target.day, position: target.position }) : "";
    },
    onDragEnd: ({ active, over }) => {
      const activeId = String(active.id);
      const next = over ? dropItem(optimistic, days, activeId, String(over.id)) : null;
      const placed = next ? locate(groupByDay(next, days), activeId) : null;
      return placed
        ? t("editorDragEnd", { title: placed.title, day: placed.day, position: placed.position })
        : t("editorDragCancel");
    },
    onDragCancel: () => t("editorDragCancel"),
  };
  const screenReaderInstructions: ScreenReaderInstructions = { draggable: t("editorDragInstructions") };

  return (
    <div className="flex flex-col gap-8" aria-busy={pending}>
      <div className="flex flex-col gap-3">
        <h2 className="is-display text-heading-2">{t("stops")}</h2>
        <p className="text-body text-lava-muted">{t("stopsHint")}</p>
        <FormError message={feedback.status === "error" ? t(`errors.${feedback.code}`) : null} />
        <FormNotice message={feedback.status === "saved" ? t("editorSaved") : null} />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements, screenReaderInstructions }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {groups.map((group, day) => {
            const title = dayTitles[day]?.trim();
            const headingId = `giorno-${day + 1}-titolo`;
            return (
              <section
                key={day}
                id={`giorno-${day + 1}`}
                aria-labelledby={headingId}
                className="rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card"
              >
                <h3 id={headingId} className="text-heading-3">
                  {t("day", { n: day + 1 })}
                  {title ? ` · ${title}` : ""}
                </h3>
                {group.length === 0 ? (
                  <EmptyDay id={dayZoneId(day)} label={t("dayEmpty")} />
                ) : (
                  <ol className="mt-3 flex flex-col">
                    {group.map((item, index) => (
                      <StopRow
                        key={item.id}
                        item={item}
                        index={index}
                        count={group.length}
                        days={days}
                        locale={locale}
                        templateId={templateId}
                        updateAction={updateAction}
                        removeAction={removeAction}
                        onStep={(direction) => step(item.id, direction)}
                        onMoveToDay={(target) => moveToDay(item.id, target)}
                      />
                    ))}
                  </ol>
                )}
                {/* Dopo un'aggiunta il giorno ha una tappa in più: il form riparte vuoto. */}
                <AddStop
                  key={`add-${day}-${group.length}`}
                  day={day}
                  locale={locale}
                  templateId={templateId}
                  activities={activities}
                  places={places}
                  action={addAction}
                />
              </section>
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// Giorno senza tappe: una zona in cui rilasciare una tappa trascinata.
function EmptyDay({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("mt-3 rounded-md border border-dashed border-border-control p-4 text-body text-lava-muted", isOver && "bg-calce-sunk")}
    >
      {label}
    </div>
  );
}

type StopRowProps = {
  item: EditorItem;
  index: number;
  count: number;
  days: number;
  locale: string;
  templateId: string;
  updateAction: AdminFormAction;
  removeAction: (formData: FormData) => Promise<void>;
  onStep: (direction: -1 | 1) => void;
  onMoveToDay: (day: number) => void;
};

// Una tappa: maniglia per trascinarla, su/giù, sposta al giorno, rimozione, e il form di
// fascia oraria e nota (updateTemplateItem, con onSubmit e startTransition).
function StopRow({
  item,
  index,
  count,
  days,
  locale,
  templateId,
  updateAction,
  removeAction,
  onStep,
  onMoveToDay,
}: StopRowProps) {
  const t = useTranslations("Admin");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const { state, onSubmit, pending } = useAdminForm(updateAction);
  const slotId = `slot-${item.id}`;
  const noteId = `note-${item.id}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("border-b border-divider py-4", isDragging && "relative z-10 rounded-md bg-calce-raised shadow-card")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={t("stopDragHandle")}
            className="inline-flex size-11 shrink-0 touch-none items-center justify-center rounded-sm text-lava-muted hover:text-lava"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
          </button>
          <span className="text-body">{item.label || t("untitledStop")}</span>
          {item.activityInactive && <span className="text-body-s font-semibold text-danger">{t("inactive")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onStep(-1)} disabled={index === 0}>
            {t("moveUp")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onStep(1)} disabled={index === count - 1}>
            {t("moveDown")}
          </Button>
          <Select
            aria-label={t("stopMoveToDay")}
            className="w-auto"
            value={String(item.dayIndex)}
            onValueChange={(next) => onMoveToDay(Number(next))}
          >
            {Array.from({ length: days }, (_, day) => (
              <option key={day} value={day}>
                {t("stopMoveToDayOption", { n: day + 1 })}
              </option>
            ))}
          </Select>
          <form action={removeAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t("remove")}
            </Button>
          </form>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="itemId" value={item.id} />
        <Field label={t("stopTimeSlot")} htmlFor={slotId}>
          <Select id={slotId} name="timeSlot" defaultValue={item.timeSlot ?? ""}>
            <option value="">{t("timeSlotNone")}</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {t(`timeSlot.${slot}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stopNote")} htmlFor={noteId}>
          <TextArea id={noteId} name="notes" rows={2} maxLength={NOTE_MAX} defaultValue={item.notes ?? ""} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("stopSave")}
        </Button>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
          <span aria-live="polite" className="text-body-s text-lava-muted">
            {state.status === "saved" ? t("stopSaved") : ""}
          </span>
        </div>
      </form>
    </li>
  );
}

// Aggiunta di una tappa in fondo al giorno: attività, luogo o titolo libero, con fascia e nota.
function AddStop({
  day,
  locale,
  templateId,
  activities,
  places,
  action,
}: {
  day: number;
  locale: string;
  templateId: string;
  activities: EditorActivity[];
  places: EditorPlace[];
  action: AdminFormAction;
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-4 border-t border-divider pt-6 md:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="dayIndex" value={day} />
      <Field label={t("stopActivity")} htmlFor={`activity-${day}`}>
        <Select id={`activity-${day}`} name="activityId" defaultValue="">
          <option value="">—</option>
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.title}
              {activity.isActive ? "" : ` (${t("inactive")})`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("stopPlace")} htmlFor={`place-${day}`}>
        <Select id={`place-${day}`} name="placeId" defaultValue="">
          <option value="">—</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("stopCustom")} htmlFor={`custom-${day}`}>
        <TextInput id={`custom-${day}`} name="customTitle" maxLength={120} />
      </Field>
      <Field label={t("stopTimeSlot")} htmlFor={`slot-add-${day}`}>
        <Select id={`slot-add-${day}`} name="timeSlot" defaultValue="">
          <option value="">{t("timeSlotNone")}</option>
          {TIME_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {t(`timeSlot.${slot}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("stopNote")} htmlFor={`note-add-${day}`}>
        <TextArea id={`note-add-${day}`} name="notes" rows={2} maxLength={NOTE_MAX} />
      </Field>
      <div className="flex flex-col gap-2 md:col-span-2">
        <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
        <p className="text-caption text-lava-muted">{t("stopSubjectHint")}</p>
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {t("addStop")}
          </Button>
        </div>
      </div>
    </form>
  );
}
