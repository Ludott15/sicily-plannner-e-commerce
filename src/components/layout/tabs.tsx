"use client";

import { useRef, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { tabIds } from "@/lib/tabs";
import { cn } from "@/lib/utils";

// Schede accessibili (role tablist, tab, roving tabindex). Lo stato sta nell'URL (?scheda=…):
// la scheda attiva si condivide e il back del browser la riporta indietro. La prima scheda è quella
// predefinita e non compare nell'URL. Frecce, Home e Fine spostano il focus e attivano la scheda.
// Il pannello lo rende la pagina con id tabIds(idPrefix, valore).panel, etichettato dalla scheda attiva.
export type TabItem = { id: string; label: string };

export function Tabs({
  idPrefix,
  label,
  tabs,
  value,
  param = "scheda",
}: {
  idPrefix: string;
  label: string;
  tabs: readonly TabItem[];
  value: string;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (index === 0) params.delete(param);
    else params.set(param, tab.id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    let next: number | undefined;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-divider [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        const ids = tabIds(idPrefix, tab.id);
        return (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative min-h-11 shrink-0 px-3 text-body-s font-semibold text-lava-muted no-underline transition-colors duration-(--dur-fast) hover:text-lava focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-pill after:bg-lava after:opacity-0 after:transition-opacity",
              "aria-selected:text-lava aria-selected:after:opacity-100",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
