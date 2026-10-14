"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/design";

// FeaturedPlaces (docs/design/components/PlaceCard/README.md): lista orizzontale di luoghi con
// scroll-snap e barra di scorrimento nascosta (.is-places in isula.css; si scorre con il dito,
// il trackpad o la tastiera). Il server passa le card già renderizzate (li) come children, già
// in ordine casuale: questo componente gestisce solo le frecce, da md in su, e lo stato degli
// estremi. Nessuno scorrimento automatico; le card restano link navigabili da tastiera.

type ChevronProps = { direction: "prev" | "next" };

function Chevron({ direction }: ChevronProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

export type FeaturedPlacesProps = {
  label: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
};

export function FeaturedPlaces({ label, prevLabel, nextLabel, children }: FeaturedPlacesProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Stato iniziale deterministico (uguale sul server): gli estremi si misurano dopo il mount.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function update(): void {
      if (!list) return;
      const max = list.scrollWidth - list.clientWidth;
      setAtStart(list.scrollLeft <= 1);
      setAtEnd(list.scrollLeft >= max - 1);
    }

    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function scrollByCard(direction: 1 | -1): void {
    const list = listRef.current;
    if (!list) return;
    const card = list.firstElementChild;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const step = card instanceof HTMLElement ? card.offsetWidth + gap : list.clientWidth * 0.8;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: direction * step, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <div className="relative">
      <div className="mb-4 hidden justify-end gap-2 md:flex">
        <Button
          variant="secondary"
          className="w-11 px-0"
          aria-label={prevLabel}
          disabled={atStart}
          onClick={() => scrollByCard(-1)}
        >
          <Chevron direction="prev" />
        </Button>
        <Button
          variant="secondary"
          className="w-11 px-0"
          aria-label={nextLabel}
          disabled={atEnd}
          onClick={() => scrollByCard(1)}
        >
          <Chevron direction="next" />
        </Button>
      </div>
      <ul
        ref={listRef}
        aria-label={label}
        className="is-places -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-6 md:px-0"
      >
        {children}
      </ul>
    </div>
  );
}
