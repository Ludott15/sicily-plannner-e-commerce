"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FieldLabel, FormAlert, controlClass } from "@/components/trips/trip-ui";
import { createGroupFromTrip } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// Nome del gruppo (1..60 caratteri, validati anche dal server). Il nome arriva precompilato dal
// titolo del viaggio; un errore lascia il testo dove l'utente l'ha scritto.
export const MAX_GROUP_NAME = 60;

const IDLE: GroupFormState = { status: "idle" };

export function CreateGroupForm({
  itineraryId,
  locale,
  defaultName,
}: {
  itineraryId: string;
  locale: string;
  defaultName: string;
}) {
  const t = useTranslations("Groups");
  const id = useId();
  const [name, setName] = useState(defaultName);
  const action = useGroupAction<{ itineraryId: string; name: string; locale: string }, GroupFormState>(
    createGroupFromTrip,
    IDLE,
  );

  const trimmed = name.trim();
  const error = action.state.status === "error" ? t(`errors.${action.state.code}`) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length === 0) return;
    action.run({ itineraryId, name: trimmed, locale });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-busy={action.pending}>
      <FieldLabel htmlFor={`${id}-name`}>{t("nameLabel")}</FieldLabel>
      <input
        id={`${id}-name`}
        name="name"
        type="text"
        required
        maxLength={MAX_GROUP_NAME}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={error !== null}
        className={controlClass}
      />
      <FormAlert message={error} />
      <div>
        <Button type="submit" variant="primary" disabled={action.pending || trimmed.length === 0}>
          {action.pending ? t("creating") : t("createAction")}
        </Button>
      </div>
    </form>
  );
}
