"use client";

import { useId, useMemo, useState, useTransition, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/design/button";
import { isSicilyAirport, SICILY_AIRPORT_CODES, SICILY_AIRPORTS, type SicilyAirportCode } from "@/lib/flights/airports";
import { getDeparture, normalizeSearchText, searchDepartures, type DepartureAirport } from "@/lib/flights/departures";
import { MAX_PASSENGERS, serializeFlightSearchParams } from "@/lib/flights/search-params";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// FlightSearch (docs/design/components/FlightSearch/README.md)
// Ricerca voli verso la Sicilia (passo 2.1). Lo stato della ricerca finisce nell'URL di /voli:
// il componente non chiama nessun servizio, i risultati li calcola la pagina server.
// - Partenza: combobox ARIA (frecce, Invio, Esc). Gli aeroporti siciliani non sono partenze: se
//   l'utente ne scrive uno, lo diciamo.
// - Arrivo: uno dei sei aeroporti siciliani. Predefinito CTA.
// - "Scambia" è visibile ma disabilitato: l'arrivo è sempre in Sicilia.
// - variant "compact" sta sotto l'hero della home e nella barra delle proposte; "full" è /voli.

export type FlightSearchInitial = {
  origin: string | null;
  destination: SicilyAirportCode | null;
  departure: string | null;
  returnDate: string | null;
  passengers: number;
  itineraryId: string | null;
};

export type FlightSearchProps = {
  variant: "compact" | "full";
  initial: FlightSearchInitial;
};

type Lang = "it" | "en";
type FieldError = "origin" | "departure" | "return";

const DEFAULT_DESTINATION: SicilyAirportCode = "CTA";
const PASSENGER_OPTIONS = Array.from({ length: MAX_PASSENGERS }, (_, i) => i + 1);
const MIN_SICILY_QUERY = 3;
const control =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava placeholder:text-lava-muted focus-visible:outline-2 focus-visible:outline-focus";

function cityLabel(airport: DepartureAirport, lang: Lang): string {
  return `${lang === "en" ? airport.city_en : airport.city_it} (${airport.iata})`;
}

// La ricerca corrisponde a un aeroporto siciliano (codice, città o nome) da tre lettere in su.
function isSicilianQuery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (normalized === "") return false;
  return Object.values(SICILY_AIRPORTS).some((airport) => {
    const names = [airport.iata.toLowerCase(), airport.city.it, airport.city.en, airport.name.it, airport.name.en].map(
      (value) => normalizeSearchText(value),
    );
    return names.some((name) => name === normalized || (normalized.length >= MIN_SICILY_QUERY && name.startsWith(normalized)));
  });
}

export function FlightSearch({ variant, initial }: FlightSearchProps) {
  const t = useTranslations("Flights");
  const locale = useLocale();
  const lang: Lang = locale === "en" ? "en" : "it";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();
  const listId = `${id}-origin-list`;
  const originId = `${id}-origin`;
  const originHelpId = `${id}-origin-help`;
  const originErrorId = `${id}-origin-error`;
  const destinationId = `${id}-destination`;
  const departureId = `${id}-departure`;
  const returnId = `${id}-return`;
  const passengersId = `${id}-passengers`;
  const swapHelpId = `${id}-swap-help`;
  const dateErrorId = `${id}-date-error`;
  const full = variant === "full";

  const initialOrigin = initial.origin ? getDeparture(initial.origin) : null;
  const [origin, setOrigin] = useState<DepartureAirport | null>(initialOrigin);
  const [query, setQuery] = useState(initialOrigin ? cityLabel(initialOrigin, lang) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [destination, setDestination] = useState<SicilyAirportCode>(initial.destination ?? DEFAULT_DESTINATION);
  const [departure, setDeparture] = useState(initial.departure ?? "");
  const [returnDate, setReturnDate] = useState(initial.returnDate ?? "");
  const [roundTrip, setRoundTrip] = useState(initial.returnDate !== null);
  const [passengers, setPassengers] = useState(initial.passengers);
  const [error, setError] = useState<FieldError | null>(null);

  const matches = useMemo(() => searchDepartures(query), [query]);
  const sicilian = origin === null && isSicilianQuery(query);
  const showList = open && origin === null && matches.length > 0;
  const showEmpty = open && origin === null && query.trim() !== "" && matches.length === 0 && !sicilian;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function choose(airport: DepartureAirport) {
    setOrigin(airport);
    setQuery(cityLabel(airport, lang));
    setOpen(false);
    setActive(-1);
    setError(null);
  }

  function onOriginChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOrigin(null);
    setOpen(true);
    setActive(-1);
    setError(null);
  }

  function onOriginKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (matches.length === 0 || origin !== null) return;
      setOpen(true);
      setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0 || origin !== null) return;
      setOpen(true);
      setActive((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      const picked = showList ? matches[active] : undefined;
      if (picked) {
        event.preventDefault();
        choose(picked);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (origin === null) return setError("origin");
    if (departure === "") return setError("departure");
    if (roundTrip && (returnDate === "" || returnDate < departure)) return setError("return");
    const params = serializeFlightSearchParams({
      origin: origin.iata,
      destination,
      departure,
      returnDate: roundTrip ? returnDate : null,
      passengers,
      itineraryId: initial.itineraryId,
    });
    startTransition(() => {
      router.push(`/voli?${params}`);
    });
  }

  const originDescribedBy = [originHelpId, error === "origin" ? originErrorId : null].filter(Boolean).join(" ");

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("formTitle")}
      data-variant={variant}
      className={cn(
        "flex flex-col rounded-xl border border-card-edge bg-calce-raised p-4 md:p-6",
        full ? "gap-6" : "gap-4",
      )}
    >
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t("tripType")}</legend>
        <label className="is-chip">
          <input
            type="radio"
            name={`${id}-trip`}
            value="oneWay"
            checked={!roundTrip}
            onChange={() => {
              setRoundTrip(false);
              setError(null);
            }}
            className="size-5 accent-coccio"
          />
          {t("oneWay")}
        </label>
        <label className="is-chip">
          <input
            type="radio"
            name={`${id}-trip`}
            value="roundTrip"
            checked={roundTrip}
            onChange={() => setRoundTrip(true)}
            className="size-5 accent-coccio"
          />
          {t("roundTrip")}
        </label>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative flex flex-col gap-1.5">
          <label htmlFor={originId} className="text-body-s font-semibold">
            {t("origin")}
          </label>
          <input
            id={originId}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={t("originPlaceholder")}
            onChange={onOriginChange}
            onKeyDown={onOriginKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
            aria-invalid={error === "origin"}
            aria-describedby={originDescribedBy}
            className={control}
          />
          <p id={originHelpId} className="text-caption text-lava-muted">
            {t("originHint")}
          </p>
          {error === "origin" && (
            <p id={originErrorId} role="alert" className="text-body-s text-danger">
              {sicilian ? t("originSicily") : t("originRequired")}
            </p>
          )}
          {sicilian && error !== "origin" && (
            <p role="status" className="text-body-s text-coccio-text">
              {t("originSicily")}
            </p>
          )}
          {showEmpty && (
            <p role="status" className="text-body-s text-lava-muted">
              {t("originNoResults")}
            </p>
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={t("originListLabel")}
            hidden={!showList}
            className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-card-edge bg-calce-raised shadow-lift"
          >
            {matches.map((airport, index) => (
              <li
                key={airport.iata}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(airport)}
                className="flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 aria-selected:bg-coccio-tint"
              >
                <span className="text-body font-semibold">{cityLabel(airport, lang)}</span>
                <span className="text-caption text-lava-muted">
                  {airport.name} · {airport.country}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={destinationId} className="text-body-s font-semibold">
            {t("destination")}
          </label>
          <select
            id={destinationId}
            value={destination}
            onChange={(event) => {
              const value = event.target.value;
              if (isSicilyAirport(value)) setDestination(value);
            }}
            className={control}
          >
            {SICILY_AIRPORT_CODES.map((code) => (
              <option key={code} value={code}>
                {`${SICILY_AIRPORTS[code].name[lang]} (${code})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {full && (
        <div className="flex flex-col items-start gap-2">
          <Button variant="ghost" disabled aria-describedby={swapHelpId}>
            {t("swap")}
          </Button>
          <p id={swapHelpId} className="text-caption text-lava-muted">
            {t("swapDisabled")}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={departureId} className="text-body-s font-semibold">
            {t("departure")}
          </label>
          <input
            id={departureId}
            type="date"
            value={departure}
            onChange={(event) => {
              setDeparture(event.target.value);
              setError(null);
            }}
            aria-invalid={error === "departure"}
            aria-describedby={error === "departure" ? dateErrorId : undefined}
            className={control}
          />
          {error === "departure" && (
            <p id={dateErrorId} role="alert" className="text-body-s text-danger">
              {t("dateRequired")}
            </p>
          )}
        </div>

        {roundTrip && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={returnId} className="text-body-s font-semibold">
              {t("returnDate")}
            </label>
            <input
              id={returnId}
              type="date"
              value={returnDate}
              min={departure || undefined}
              onChange={(event) => {
                setReturnDate(event.target.value);
                setError(null);
              }}
              aria-invalid={error === "return"}
              aria-describedby={error === "return" ? dateErrorId : undefined}
              className={control}
            />
            {error === "return" && (
              <p id={dateErrorId} role="alert" className="text-body-s text-danger">
                {t("returnBeforeDeparture")}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={passengersId} className="text-body-s font-semibold">
            {t("passengers")}
          </label>
          <select
            id={passengersId}
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value))}
            className={control}
          >
            {PASSENGER_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {t("passengersOption", { count })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-s text-lava-muted">{initial.itineraryId ? t("fromTrip") : t("priceNote")}</p>
        <Button type="submit" variant={full ? "primary" : "secondary"} disabled={pending} aria-busy={pending}>
          {pending ? t("searching") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
