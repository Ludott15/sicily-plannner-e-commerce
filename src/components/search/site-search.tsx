"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Search } from "lucide-react";
import { Button, ButtonLink } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { SEARCH_DEBOUNCE_MS, flattenOptions, isSearchGroups, searchPageHref, shouldSearch } from "@/components/search/search-model";
import type { SearchGroups, SearchHit } from "@/server/search/queries";

// Ricerca nel sito (passo 11.2). Combobox ARIA 1.2: il campo ha il ruolo combobox, il listbox
// raggruppa le opzioni per tipo (intestazione di gruppo), il focus resta nel campo e
// aria-activedescendant indica la voce evidenziata. Frecce per scegliere, Invio apre la voce
// evidenziata o va a /cerca?q=, Esc chiude. Le richieste si ritardano di 200 ms e quella precedente
// si annulla. Su mobile non compare: lo header mostra un'icona che porta a /cerca.
// Il variant "page" è il campo grande di /cerca, con la query già scritta e il focus.

type Status = "idle" | "loading" | "ready" | "error";

export type SiteSearchProps = {
  variant: "header" | "page";
  initialQuery?: string;
  autoFocus?: boolean;
};

export function SiteSearch({ variant, initialQuery = "", autoFocus = false }: SiteSearchProps) {
  const t = useTranslations("Search");
  const locale = useLocale();
  const router = useRouter();
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [groups, setGroups] = useState<SearchGroups | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);

  const trimmed = query.trim();
  // Sotto la soglia non ci sono risultati da mostrare: lo stato si deriva, senza setState nell'effetto.
  const searchable = shouldSearch(query);
  const shownGroups = searchable ? groups : null;
  const shownStatus: Status = searchable ? status : "idle";
  const options: SearchHit[] = shownGroups ? flattenOptions(shownGroups) : [];
  const hasOptions = options.length > 0;
  const panelVisible = open && searchable;
  const listboxOpen = panelVisible && shownStatus === "ready" && hasOptions;
  const activeId = listboxOpen && active >= 0 ? optionId(active) : undefined;

  function optionId(index: number) {
    return `${baseId}-option-${index}`;
  }

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Ricerca ritardata: ogni modifica annulla il timer e la richiesta in volo della precedente.
  useEffect(() => {
    if (!shouldSearch(query)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: query.trim(), l: locale });
        const response = await fetch(`/api/search/suggest?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`search ${response.status}`);
        // La route risponde { groups: SearchGroups }.
        const body: unknown = await response.json();
        const data = typeof body === "object" && body !== null && "groups" in body ? body.groups : null;
        if (!isSearchGroups(data)) throw new Error("search: risposta non valida");
        setGroups(data);
        setActive(-1);
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setGroups(null);
        setStatus("error");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, attempt]);

  function navigate(href: string) {
    setOpen(false);
    setActive(-1);
    router.push(href);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOpen(true);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hasOptions) return;
      event.preventDefault();
      setOpen(true);
      const last = options.length - 1;
      setActive((current) => {
        if (event.key === "ArrowDown") return current < 0 || current >= last ? 0 : current + 1;
        return current <= 0 ? last : current - 1;
      });
    } else if (event.key === "Escape" && panelVisible) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  // Invio: la voce evidenziata, altrimenti la pagina dei risultati completi.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = active >= 0 ? options[active] : undefined;
    if (listboxOpen && choice) {
      navigate(choice.href);
      return;
    }
    if (trimmed.length > 0) navigate(searchPageHref(trimmed));
  }

  // Chiude il listbox quando il focus esce dal componente (le voci non sono focusabili).
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setOpen(false);
    setActive(-1);
  }

  function retry() {
    setStatus("loading");
    setAttempt((count) => count + 1);
  }

  const isPage = variant === "page";

  return (
    <div className="relative w-full" onBlur={onBlur}>
      <form role="search" onSubmit={onSubmit} className="relative">
        <label htmlFor={`${baseId}-input`} className="sr-only">
          {t(isPage ? "pageLabel" : "label")}
        </label>
        <Search
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lava-muted"
        />
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          role="combobox"
          type="text"
          maxLength={100}
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={t("placeholder")}
          aria-autocomplete="list"
          aria-expanded={listboxOpen}
          aria-controls={`${baseId}-listbox`}
          aria-activedescendant={activeId}
          className={cn(
            "min-h-11 w-full rounded-pill border-[1.5px] border-border-control bg-calce-raised pr-4 pl-10 text-body text-lava placeholder:text-lava-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            isPage && "min-h-14 pl-12 text-body-l",
          )}
        />
      </form>

      <div
        className={cn(
          "absolute top-full right-0 left-0 z-30 mt-2 max-h-[70vh] flex-col overflow-y-auto rounded-lg border-[1.5px] border-card-edge bg-calce-raised p-2 shadow-lift",
          panelVisible ? "flex" : "hidden",
        )}
      >
        {shownStatus === "loading" && !hasOptions && (
          <div className="flex flex-col gap-2 p-2" aria-hidden="true">
            <span className="h-4 w-2/3 rounded-sm bg-calce-sunk motion-safe:animate-pulse" />
            <span className="h-4 w-1/2 rounded-sm bg-calce-sunk motion-safe:animate-pulse" />
          </div>
        )}

        {shownStatus === "error" && (
          <div className="flex flex-col items-start gap-3 p-2">
            <p className="flex items-center gap-2 text-body">
              <AlertCircle size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-danger" />
              {t("error")}
            </p>
            <Button size="sm" variant="secondary" onClick={retry}>
              {t("retry")}
            </Button>
          </div>
        )}

        {shownStatus === "ready" && !hasOptions && <p className="p-2 text-body">{t("noResults", { query: trimmed })}</p>}

        <ul id={`${baseId}-listbox`} role="listbox" aria-label={t("suggestions")} hidden={!listboxOpen} className="flex flex-col gap-1">
          {shownGroups?.groups.map((group) => (
            <li key={group.kind} role="group" aria-labelledby={`${baseId}-group-${group.kind}`}>
              <p
                id={`${baseId}-group-${group.kind}`}
                role="presentation"
                className="px-3 pt-2 pb-1 text-caption font-semibold tracking-[0.08em] text-lava-muted uppercase"
              >
                {t(`kinds.${group.kind}`)}
              </p>
              <ul role="presentation" className="flex flex-col">
                {group.hits.map((hit) => {
                  const index = options.indexOf(hit);
                  const selected = index === active;
                  return (
                    <li
                      key={`${hit.kind}-${hit.slug}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => navigate(hit.href)}
                      className={cn("flex min-h-11 cursor-pointer flex-col justify-center rounded-sm px-3 py-2", selected && "bg-calce-sunk")}
                    >
                      <span className="text-body font-semibold text-lava">{hit.title}</span>
                      {hit.subtitle && (
                    <span className="text-body-s text-lava-muted">
                      {/* Per gli itinerari il server passa il numero di giorni. */}
                      {hit.kind === "itinerary" ? t("itineraryDays", { count: Number(hit.subtitle) }) : hit.subtitle}
                    </span>
                  )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        {panelVisible && shownStatus !== "error" && (
          <ButtonLink
            href={searchPageHref(trimmed)}
            variant="ghost"
            className="mt-1 justify-start"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen(false)}
          >
            {t("seeAll")}
          </ButtonLink>
        )}
      </div>

      {/* Annuncio per i lettori di schermo senza ruolo status: il campo sta in ogni pagina e non deve
          confondersi con gli stati della pagina. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {shownStatus === "ready" && hasOptions
          ? t("resultsCount", { count: options.length, query: trimmed })
          : shownStatus === "loading"
            ? t("loading")
            : ""}
      </p>
    </div>
  );
}
