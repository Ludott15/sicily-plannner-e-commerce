"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FormAlert } from "@/components/trips/trip-ui";
import { acceptInviteAction } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// "Entra nel gruppo" per chi ha un account e i gusti completati. Con esito positivo l'azione
// porta alla pagina del gruppo; un errore resta qui, con il motivo.
const IDLE: GroupFormState = { status: "idle" };

export function AcceptInviteButton({ token, locale }: { token: string; locale: string }) {
  const t = useTranslations("GroupInvite");
  const tErrors = useTranslations("Groups");
  const action = useGroupAction<{ token: string; locale: string }, GroupFormState>(acceptInviteAction, IDLE);
  const error = action.state.status === "error" ? tErrors(`errors.${action.state.code}`) : null;

  return (
    <div className="flex flex-col gap-3" aria-busy={action.pending}>
      <div>
        <Button
          variant="primary"
          disabled={action.pending}
          onClick={() => action.run({ token, locale })}
        >
          {action.pending ? t("joining") : t("join")}
        </Button>
      </div>
      <FormAlert message={error} />
    </div>
  );
}
