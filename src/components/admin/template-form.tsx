"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { PACES, TRAVEL_PARTIES, type Pace, type TravelParty } from "@/lib/itinerary-checks";
import type { AdminFormAction } from "@/lib/admin-form";
import { useAdminForm } from "./use-admin-form";
import { Checkbox, Field, FormError, Select, TextArea, TextInput } from "./fields";

// Dati dell'itinerario pronto: titolo, slug di pubblicazione, giorni, sottotitolo e descrizione,
// ritmo, mesi consigliati, adatto a, poi titoli e introduzioni dei giorni e la notte per notte.
// Le tappe si modificano nell'editor sotto il form (TemplateEditor), con le sue azioni.

const DAY_INTRO_MAX = 280;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export type TemplateNightValue = { nightIndex: number; areaId: string | null; placeId: string | null };

export type TemplateFormValues = {
  id?: string;
  title: string;
  slug: string | null;
  days: number;
  subtitle: string | null;
  description: string | null;
  pace: Pace | null;
  seasonMonths: number[];
  suitableFor: TravelParty[];
  dayTitles: string[];
  dayIntros: string[];
  nights: TemplateNightValue[];
};

export type NightOptions = {
  areas: { id: string; nameIt: string }[];
  places: { id: string; name: string }[];
};

// Nome breve del mese nella lingua della pagina: la data è fissa, quindi il testo è lo stesso a ogni render.
function monthLabel(locale: string, month: number) {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2026, month - 1, 1));
}

function nightValue(nights: TemplateNightValue[], nightIndex: number) {
  const night = nights.find((n) => n.nightIndex === nightIndex);
  if (!night) return "";
  if (night.areaId) return `area:${night.areaId}`;
  if (night.placeId) return `place:${night.placeId}`;
  return "";
}

// Introduzione di un giorno, con il contatore dei caratteri (il server accetta fino a 280).
function DayIntroField({ index, initial }: { index: number; initial: string }) {
  const t = useTranslations("Admin");
  const [length, setLength] = useState(initial.length);
  const id = `dayIntro_${index}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={t("fieldDayIntro", { n: index + 1 })} hint={t("fieldDayIntroHint")} htmlFor={id}>
        <TextArea
          id={id}
          name={id}
          rows={2}
          maxLength={DAY_INTRO_MAX}
          defaultValue={initial}
          aria-describedby={`${id}-count`}
          onChange={(event) => setLength(event.target.value.length)}
        />
      </Field>
      <span id={`${id}-count`} className="text-caption text-lava-muted">
        {t("charCount", { count: length, max: DAY_INTRO_MAX })}
      </span>
    </div>
  );
}

export function TemplateForm({
  action,
  locale,
  values,
  options,
}: {
  action: AdminFormAction;
  locale: string;
  values: TemplateFormValues;
  options: NightOptions;
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useAdminForm(action);
  // Il campo tiene il testo digitato (anche vuoto o in corso); il numero limitato serve solo a titoli e notti.
  const [daysInput, setDaysInput] = useState(String(values.days));
  const days = Math.max(1, Math.min(60, Math.floor(Number(daysInput)) || 1));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" aria-busy={pending}>
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />

      <div className="grid gap-6 md:grid-cols-3">
        <Field label={t("fieldTitle")} htmlFor="title">
          <TextInput id="title" name="title" defaultValue={values.title} required />
        </Field>
        <Field label={t("fieldTemplateSlug")} hint={t("fieldTemplateSlugHint")} htmlFor="slug">
          <TextInput id="slug" name="slug" defaultValue={values.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
        <Field label={t("fieldDays")} htmlFor="days">
          <TextInput
            id="days"
            name="days"
            type="number"
            min={1}
            max={60}
            value={daysInput}
            onChange={(e) => setDaysInput(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label={t("fieldSubtitle")} hint={t("fieldSubtitleHint")} htmlFor="subtitle">
          <TextInput id="subtitle" name="subtitle" defaultValue={values.subtitle ?? ""} maxLength={140} />
        </Field>
        <Field label={t("fieldPace")} hint={t("fieldPaceHint")} htmlFor="pace">
          <Select id="pace" name="pace" defaultValue={values.pace ?? ""}>
            <option value="">{t("fieldPaceNone")}</option>
            {PACES.map((pace) => (
              <option key={pace} value={pace}>
                {t(`pace.${pace}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("fieldDescription")} htmlFor="description">
        <TextArea id="description" name="description" rows={4} maxLength={2000} defaultValue={values.description ?? ""} />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("fieldTemplateSeason")}</legend>
        <p className="text-caption text-lava-muted">{t("fieldTemplateSeasonHint")}</p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-4 md:grid-cols-6">
          {MONTHS.map((month) => (
            <Checkbox
              key={month}
              name="seasonMonths"
              value={month}
              label={monthLabel(locale, month)}
              defaultChecked={values.seasonMonths.includes(month)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("fieldSuitableFor")}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRAVEL_PARTIES.map((party) => (
            <Checkbox
              key={party}
              name="suitableFor"
              value={party}
              label={t(`party.${party}`)}
              defaultChecked={values.suitableFor.includes(party)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-s font-semibold">{t("fieldDayTitles")}</legend>
        <p className="text-caption text-lava-muted">{t("fieldDayTitleHint")}</p>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: days }, (_, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-md border border-divider p-4">
              <Field label={t("fieldDayTitle", { n: i + 1 })} htmlFor={`dayTitle_${i}`}>
                <TextInput id={`dayTitle_${i}`} name={`dayTitle_${i}`} defaultValue={values.dayTitles[i] ?? ""} maxLength={80} />
              </Field>
              <DayIntroField index={i} initial={values.dayIntros[i] ?? ""} />
            </div>
          ))}
        </div>
      </fieldset>

      {days > 1 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-body-s font-semibold">{t("nightsTitle")}</legend>
          <p className="text-caption text-lava-muted">{t("nightsHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: days - 1 }, (_, i) => i + 1).map((night) => (
              <Field key={night} label={t("nightLabel", { n: night })} htmlFor={`night_${night}`}>
                <Select id={`night_${night}`} name={`night_${night}`} defaultValue={nightValue(values.nights, night)}>
                  <option value="">{t("nightNone")}</option>
                  <optgroup label={t("nightGroupAreas")}>
                    {options.areas.map((area) => (
                      <option key={area.id} value={`area:${area.id}`}>
                        {area.nameIt}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("nightGroupPlaces")}>
                    {options.places.map((place) => (
                      <option key={place.id} value={`place:${place.id}`}>
                        {place.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
