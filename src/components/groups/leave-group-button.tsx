"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FormAlert } from "@/components/trips/trip-ui";
import { leaveGroup } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// Uscita dal gruppo per un membro (non per l'owner: il server risponde cannot_leave_as_owner).
// Con esito positivo l'azione porta alla lista dei viaggi.
const IDLE: GroupFormState = { status: "idle" };

export function LeaveGroupButton({ groupId, locale }: { groupId: string; locale: string }) {
  const t = useTranslations("Groups");
  const [confirming, setConfirming] = useState(false);
  const action = useGroupAction<{ groupId: string; locale: string }, GroupFormState>(leaveGroup, IDLE);
  const error = action.state.status === "error" ? t(`errors.${action.state.code}`) : null;

  return (
    <section aria-labelledby="group-leave" className="flex flex-col gap-3" aria-busy={action.pending}>
      <h2 id="group-leave" className="text-heading-3">
        {t("leaveHeading")}
      </h2>
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-lava-muted">{t("leaveText")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={action.pending}
              onClick={() => action.run({ groupId, locale })}
            >
              {t("confirmLeave")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={action.pending}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {t("leave")}
          </Button>
        </div>
      )}
      <FormAlert message={error} />
    </section>
  );
}
