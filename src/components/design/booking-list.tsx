"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PendingId } from "@/lib/pending-actions";
import { ButtonAnchor } from "./button";
import { PendingButton } from "./pending-button";

// BookingList (docs/design/components/BookingList/README.md)
// Checklist "Da prenotare": lo stato lo segna l'utente con la casella da 44px
// (role="checkbox"), non riceviamo conferme dai partner. Una voce segnata è barrata
// in lava-muted e perde il bottone verso il partner. Conteggio sempre nella forma
// "3 da prenotare · 1 fatto" (bookingCount), identico in intestazione, bottone e lista.
// Riga di trasparenza sugli affiliati sotto la lista.
// Una voce con searchAction (ricerca voli, alloggi, noleggi: link interno o firmato) mostra il
// link al posto del partner. Una voce con pending (partner non ancora pronto, "in arrivo") mostra
// il bottone in sospeso. Una voce con note mostra una riga di spiegazione sotto il nome (es. cosa
// manca per la ricerca), senza bottone.

export type BookingItem = {
  id: string;
  name: string;
  partner: string | null;
  href: string | null;
  done: boolean;
  // Azione verso una pagina del sito o un link firmato: al posto del bottone del partner.
  searchAction?: { href: string; label: string } | null;
  // Azione in sospeso (partner non ancora configurato): bottone disabilitato con l'etichetta.
  pending?: { id: PendingId; label: string } | null;
  // Spiegazione sotto il nome, per le voci senza azione.
  note?: string | null;
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
            {!item.partner && item.note && <div className="is-booking__partner">{item.note}</div>}
          </div>
          {item.done ? (
            <span />
          ) : item.searchAction ? (
            <ButtonAnchor variant="secondary" size="sm" href={item.searchAction.href}
              rel={item.searchAction.href.startsWith("/api/go/") ? "sponsored noopener" : undefined}
            >
              {item.searchAction.label}
            </ButtonAnchor>
          ) : item.href && item.partner ? (
            <ButtonAnchor variant="secondary" size="sm" href={item.href} rel="sponsored noopener">
              {t("onPartner", { partner: item.partner })}
            </ButtonAnchor>
          ) : item.pending ? (
            <PendingButton id={item.pending.id} variant="secondary" size="sm">
              {item.pending.label}
            </PendingButton>
          ) : (
            <span />
          )}
        </div>
      ))}
      <span className="is-bookings__disclose">{t("bookingsDisclose")}</span>
    </section>
  );
}
