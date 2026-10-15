"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { ButtonAnchor } from "./button";
import { PendingButton } from "./pending-button";

// BookingList (docs/design/components/BookingList/README.md)
// Checklist "Da prenotare": lo stato lo segna l'utente con la casella da 44px
// (role="checkbox"), non riceviamo conferme dai partner. Una voce segnata è barrata
// in lava-muted e perde il bottone verso il partner. Conteggio sempre nella forma
// "3 da prenotare · 1 fatto" (bookingCount), identico in intestazione, bottone e lista.
// Riga di trasparenza sugli affiliati sotto la lista.
// Finché il link al partner non esiste (M6) il bottone è un'azione in sospeso; una voce senza
// partner noto (alloggio, auto, voli fino alla M6) non mostra la riga del partner.
// Una voce con searchAction (es. voli: la ricerca di /voli) mostra il link interno al posto del partner.

export type BookingItem = {
  id: string;
  name: string;
  partner: string | null;
  href: string | null;
  done: boolean;
  // Azione verso una pagina del sito (es. la ricerca voli): al posto del bottone del partner.
  searchAction?: { href: string; label: string } | null;
};

export function bookingCounts(items: Pick<BookingItem, "done">[]) {
  const done = items.filter((i) => i.done).length;
  return { todo: items.length - done, done };
}

// Stessa formula ovunque compaia il conteggio.
export function useBookingCountLabel() {
  const t = useTranslations("Design");
  return (items: Pick<BookingItem, "done">[]) => t("bookingsCount", bookingCounts(items));
}

export function BookingList({
  items,
  onDoneChange,
}: {
  items: BookingItem[];
  onDoneChange: (id: string, done: boolean) => void;
}) {
  const t = useTranslations("Design");
  const countLabel = useBookingCountLabel();

  return (
    <section aria-labelledby="bookings-title">
      <div className="is-bookings__head">
        <h2 id="bookings-title" className="is-bookings__title">
          {t("bookingsTitle")}
        </h2>
        <span className="is-count">{countLabel(items)}</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="is-booking" data-done={item.done}>
          <button
            type="button"
            className="is-check"
            role="checkbox"
            aria-checked={item.done}
            aria-label={t("markBooked", { name: item.name })}
            onClick={() => onDoneChange(item.id, !item.done)}
          >
            <span className="is-check__box">
              <Check size={14} strokeWidth={3} aria-hidden="true" />
            </span>
          </button>
          <div>
            <div className="is-booking__name">{item.name}</div>
            {item.partner && <div className="is-booking__partner">{item.partner}</div>}
          </div>
          {item.done ? (
            <span />
          ) : item.searchAction ? (
            <ButtonAnchor variant="secondary" size="sm" href={item.searchAction.href}>
              {item.searchAction.label}
            </ButtonAnchor>
          ) : item.href && item.partner ? (
            <ButtonAnchor variant="secondary" size="sm" href={item.href} rel="sponsored noopener">
              {t("onPartner", { partner: item.partner })}
            </ButtonAnchor>
          ) : (
            <PendingButton id="booking.partner-link" variant="secondary" size="sm">
              {item.partner ? t("onPartner", { partner: item.partner }) : t("book")}
            </PendingButton>
          )}
        </div>
      ))}
      <span className="is-bookings__disclose">{t("bookingsDisclose")}</span>
    </section>
  );
}
