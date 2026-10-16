"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Checkbox, FormError, FormNotice } from "./fields";
import { useEditorialAction, type EditorialAction } from "./use-editorial-action";

// Collegamenti di una guida: luoghi, attività, itinerari e prodotti scelti da elenchi di bersagli
// pubblici. L'ordine di selezione è l'ordine nell'articolo: il campo "links" è il JSON di
// [{ kind, targetId, position }] che setGuideLinks valida. Nessun link libero.

export type GuideLinkKind = "place" | "activity" | "itinerary" | "product";
export type GuideLinkOption = { id: string; label: string };
export type GuideLinkChoice = { kind: GuideLinkKind; targetId: string };

const GROUP_KEYS: Record<GuideLinkKind, string> = {
  place: "places",
  activity: "activities",
  itinerary: "itineraries",
  product: "products",
};

const KINDS: GuideLinkKind[] = ["place", "activity", "itinerary", "product"];

export function GuideLinksForm({
  action,
  guideId,
  options,
  selected,
}: {
  action: EditorialAction;
  guideId: string;
  options: Record<GuideLinkKind, GuideLinkOption[]>;
  selected: GuideLinkChoice[];
}) {
  const t = useTranslations("Admin");
  const { state, onSubmit, pending } = useEditorialAction(action);
  const [chosen, setChosen] = useState<GuideLinkChoice[]>(selected);

  const isChosen = (kind: GuideLinkKind, targetId: string) =>
    chosen.some((choice) => choice.kind === kind && choice.targetId === targetId);

  function toggle(kind: GuideLinkKind, targetId: string, checked: boolean) {
    setChosen((current) => {
      const without = current.filter((choice) => !(choice.kind === kind && choice.targetId === targetId));
      return checked ? [...without, { kind, targetId }] : without;
    });
  }

  const payload = JSON.stringify(chosen.map((choice, position) => ({ kind: choice.kind, targetId: choice.targetId, position })));
  const errorMessage =
    state.status === "error"
      ? t.has(`guides.errors.${state.code}`)
        ? t(`guides.errors.${state.code}`)
        : t("guides.errors.failed")
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-busy={pending}>
      <input type="hidden" name="id" value={guideId} />
      <input type="hidden" name="links" value={payload} />
      <FormError message={errorMessage} />
      <FormNotice message={state.status === "saved" ? t("guides.links.saved") : null} />
      {KINDS.map((kind) => (
        <fieldset key={kind} className="flex flex-col gap-2">
          <legend className="text-body-s font-semibold">{t(`guides.links.${GROUP_KEYS[kind]}`)}</legend>
          {options[kind].length === 0 ? (
            <p className="text-body text-lava-muted">{t("guides.links.none")}</p>
          ) : (
            options[kind].map((option) => (
              <Checkbox
                key={option.id}
                checked={isChosen(kind, option.id)}
                onChange={(event) => toggle(kind, option.id, event.target.checked)}
                label={option.label}
              />
            ))
          )}
        </fieldset>
      ))}
      <p className="text-body-s text-lava-muted">{t("guides.links.hint")}</p>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t("guides.saving") : t("guides.links.save")}
        </Button>
      </div>
    </form>
  );
}
