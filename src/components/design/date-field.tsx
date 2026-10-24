"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  clampIsoDate,
  dayNumber,
  isDateDisabled,
  isValidIsoDate,
  mondayIndex,
  monthGrid,
  monthKey,
  parseIsoDate,
  todayIso,
} from "./calendar";

// Campo data con calendario mensile (docs/design/components/DateField/README.md).
// Settimana da lunedì; mesi e giorni con Intl nella lingua corrente. Il valore è una stringa ISO
// "YYYY-MM-DD" in un input nascosto con `name`, quindi le form GET e le azioni server lo leggono come
// prima. Tastiera secondo il pattern ARIA "date picker dialog": frecce, PagSu/PagGiù per il mese,
// Home/Fine per settimana, Invio e Spazio per scegliere, Esc per chiudere.

export type DateFieldProps = {
  id?: string;
  name?: string;
  // Nome accessibile del campo (aria-label del pulsante), se non c'è un <label htmlFor={id}>.
  label?: string;
  placeholder?: string;
  // Controllato: value e onValueChange. Non controllato: defaultValue.
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function DateField({
  id,
  name,
  label,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  required = false,
  disabled = false,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: DateFieldProps) {
  const t = useTranslations("Controls");
  const locale = useLocale();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const titleId = `${generatedId}-title`;

  const controlled = value !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const current = controlled ? value : internal;
  const selected = parseIsoDate(current);

  const [open, setOpen] = useState<boolean>(false);
  // Data con il cursore: decide il mese mostrato e la cella con tabIndex 0.
  const [focusIso, setFocusIso] = useState<string>("");
  const [today, setToday] = useState<string>("");
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<boolean>(false);
  // Il calendario va nel dialog nativo che contiene il campo (sotto il top layer resterebbe invisibile).
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  function trackTrigger(node: HTMLButtonElement | null) {
    triggerRef.current = node;
    dialogRef.current = node?.closest("dialog") ?? null;
  }

  // Dopo una mossa da tastiera la cella nuova prende il focus (dopo il render del mese).
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusIso}"]`)?.focus();
  }, [focusIso]);

  function commit(next: string) {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }

  function choose(iso: string) {
    if (!isValidIsoDate(iso) || isDateDisabled(iso, min, max)) return;
    commit(iso);
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    if (next) {
      // Oggi si legge all'apertura, mai nel render: il calendario non è mai SSR-idratato aperto.
      const now = todayIso();
      setToday(now);
      setFocusIso(clampIsoDate(selected ? current : now, min, max));
    }
    setOpen(next);
  }

  function moveTo(next: string | null, shouldFocus: boolean) {
    if (!next) return;
    pendingFocus.current = shouldFocus;
    setFocusIso(next);
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const focus = parseIsoDate(focusIso);
    if (!focus) return;
    const weekStart = addDays(focusIso, -mondayIndex(dayNumber(focus)));
    let next: string | null = null;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(focusIso, -1);
        break;
      case "ArrowRight":
        next = addDays(focusIso, 1);
        break;
      case "ArrowUp":
        next = addDays(focusIso, -7);
        break;
      case "ArrowDown":
        next = addDays(focusIso, 7);
        break;
      case "PageUp":
        next = addMonths(focusIso, -1);
        break;
      case "PageDown":
        next = addMonths(focusIso, 1);
        break;
      case "Home":
        next = weekStart;
        break;
      case "End":
        next = weekStart ? addDays(weekStart, 6) : null;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(focusIso);
        return;
      default:
        return;
    }
    event.preventDefault();
    moveTo(next, true);
  }

  const shown = parseIsoDate(focusIso);
  const rows = shown ? monthGrid(shown.year, shown.month) : [];
  const monthTitle = shown
    ? capitalize(new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(shown.year, shown.month - 1, 15)))
    : "";
  const weekdays = Array.from({ length: 7 }, (_, index) => ({
    short: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + index)),
    long: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 1 + index)),
  }));
  const shortFormat = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const longFormat = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayDisabled = !today || isDateDisabled(today, min, max);
  function longLabel(iso: string): string {
    const date = parseIsoDate(iso);
    return date ? longFormat.format(new Date(date.year, date.month - 1, date.day)) : iso;
  }

  return (
    <div className={cn("is-date", className)}>
      <BasePopover.Root open={open} onOpenChange={onOpenChange} modal="trap-focus">
        <BasePopover.Trigger
          ref={trackTrigger}
          id={fieldId}
          aria-label={label}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          className={cn("is-field is-date__trigger", !selected && "is-date__trigger--empty")}
        >
          <CalendarDays size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-lava-muted" />
          <span className="is-date__text">
            {selected
              ? shortFormat.format(new Date(selected.year, selected.month - 1, selected.day))
              : (placeholder ?? t("placeholder"))}
          </span>
        </BasePopover.Trigger>

        <BasePopover.Portal container={dialogRef}>
          <BasePopover.Positioner
            className="is-overlay is-popover__positioner"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            <BasePopover.Popup
              className="is-panel is-popover is-calendar"
              aria-label={t("calendar")}
              initialFocus={() => gridRef.current?.querySelector<HTMLElement>('[data-date][tabindex="0"]') ?? null}
            >
              <span className="is-sheet-handle" aria-hidden="true" />
              <div className="is-calendar__head">
                <button
                  type="button"
                  className="is-icon-btn"
                  aria-label={t("prevMonth")}
                  onClick={() => moveTo(addMonths(focusIso, -1), false)}
                >
                  <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <p id={titleId} className="is-calendar__title" aria-live="polite">
                  {monthTitle}
                </p>
                <button
                  type="button"
                  className="is-icon-btn"
                  aria-label={t("nextMonth")}
                  onClick={() => moveTo(addMonths(focusIso, 1), false)}
                >
                  <ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>

              <div
                ref={gridRef}
                role="grid"
                aria-labelledby={titleId}
                data-month={monthKey(focusIso) ?? undefined}
                className="is-calendar__grid"
                onKeyDown={onGridKeyDown}
              >
                <div role="row" className="is-calendar__row">
                  {weekdays.map((weekday) => (
                    <div key={weekday.long} role="columnheader" aria-label={weekday.long} className="is-calendar__weekday">
                      {weekday.short}
                    </div>
                  ))}
                </div>
                {rows.map((row, rowIndex) => (
                  <div role="row" key={rowIndex} className="is-calendar__row">
                    {row.map((cell, columnIndex) =>
                      cell.inMonth ? (
                        <div
                          key={cell.iso}
                          role="gridcell"
                          tabIndex={cell.iso === focusIso ? 0 : -1}
                          data-date={cell.iso}
                          aria-label={longLabel(cell.iso)}
                          aria-selected={cell.iso === current}
                          aria-disabled={isDateDisabled(cell.iso, min, max) || undefined}
                          aria-current={cell.iso === today ? "date" : undefined}
                          className="is-calendar__day"
                          onFocus={() => setFocusIso(cell.iso)}
                          onClick={() => choose(cell.iso)}
                        >
                          {cell.day}
                        </div>
                      ) : (
                        <div key={`empty-${rowIndex}-${columnIndex}`} role="gridcell" aria-hidden="true" className="is-calendar__empty" />
                      ),
                    )}
                  </div>
                ))}
              </div>

              <div className="is-popover__foot is-calendar__foot">
                {!required && (
                  <button
                    type="button"
                    className="is-btn is-btn--ghost is-btn--sm"
                    onClick={() => {
                      commit("");
                      setOpen(false);
                    }}
                  >
                    {t("clear")}
                  </button>
                )}
                <button
                  type="button"
                  className="is-btn is-btn--secondary is-btn--sm ml-auto"
                  disabled={todayDisabled}
                  onClick={() => choose(today)}
                >
                  {t("today")}
                </button>
              </div>
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      </BasePopover.Root>

      {required ? (
        // Un input nascosto non partecipa alla validazione: questo testuale sr-only la porta, e il
        // suo focus riporta al campo visibile.
        <input
          type="text"
          name={name}
          value={current}
          required
          tabIndex={-1}
          aria-hidden="true"
          className="is-date__required"
          onChange={noop}
          onFocus={() => triggerRef.current?.focus()}
        />
      ) : (
        <input type="hidden" name={name} value={current} />
      )}
    </div>
  );
}

function noop(): void {}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
