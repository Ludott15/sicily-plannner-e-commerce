"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FieldLabel, FormAlert, controlClass } from "@/components/trips/trip-ui";
import { useRouter } from "@/lib/i18n/navigation";
import { renameGroup } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { MAX_GROUP_NAME } from "./create-group-form";
import { useGroupAction } from "./use-group-action";

// Rinomina del gruppo, solo per l'owner (la RLS e l'azione lo impongono comunque).
const IDLE: GroupFormState = { status: "idle" };

export function RenameGroupForm({ groupId, name }: { groupId: string; name: string }) {
  const t = useTranslations("Groups");
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const action = useGroupAction<{ groupId: string; name: string }, GroupFormState>(renameGroup, IDLE);

  // Dopo un esito positivo la pagina ricarica i dati dal server (nome nell'intestazione).
  useEffect(() => {
    if (action.state.status === "ok") router.refresh();
  }, [action.state, router]);

  const trimmed = value.trim();
  const error = action.state.status === "error" ? t(`errors.${action.state.code}`) : null;
  const saved = action.state.status === "ok" && !action.pending ? t("renamed") : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length === 0) return;
    action.run({ groupId, name: trimmed });
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
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={error !== null}
        className={controlClass}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={action.pending || trimmed.length === 0 || trimmed === name}>
          {t("renameAction")}
        </Button>
        {saved && (
          <p aria-live="polite" className="text-body-s text-lava-muted">
            {saved}
          </p>
        )}
      </div>
      <FormAlert message={error} />
    </form>
  );
}
