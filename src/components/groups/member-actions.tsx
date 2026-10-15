"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FormAlert } from "@/components/trips/trip-ui";
import { useRouter } from "@/lib/i18n/navigation";
import { removeMember, transferOwnership } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// Azioni dell'owner su un membro: rendere proprietario o rimuovere. Ogni azione chiede conferma
// in linea (niente finestre di sistema) e, se riesce, ricarica la pagina dal server.
const IDLE: GroupFormState = { status: "idle" };

type MemberPayload = { groupId: string; userId: string };

export function MemberActions({ groupId, userId, name }: { groupId: string; userId: string; name: string }) {
  const t = useTranslations("Groups");
  const router = useRouter();
  const [confirming, setConfirming] = useState<"transfer" | "remove" | null>(null);
  const transfer = useGroupAction<MemberPayload, GroupFormState>(transferOwnership, IDLE);
  const remove = useGroupAction<MemberPayload, GroupFormState>(removeMember, IDLE);

  useEffect(() => {
    if (transfer.state.status === "ok" || remove.state.status === "ok") router.refresh();
  }, [transfer.state, remove.state, router]);

  const busy = transfer.pending || remove.pending;
  const transferError = transfer.state.status === "error" ? t(`errors.${transfer.state.code}`) : null;
  const removeError = remove.state.status === "error" ? t(`errors.${remove.state.code}`) : null;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end" aria-busy={busy}>
      {confirming === null && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming("transfer")}>
            {t("makeOwner")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming("remove")}>
            {t("remove")}
          </Button>
        </div>
      )}
      {confirming === "transfer" && (
        <div className="flex flex-col gap-2">
          <p className="text-body-s">{t("confirmTransferText", { name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => {
                transfer.run({ groupId, userId });
                setConfirming(null);
              }}
            >
              {t("confirmTransfer")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      {confirming === "remove" && (
        <div className="flex flex-col gap-2">
          <p className="text-body-s">{t("confirmRemoveText", { name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => {
                remove.run({ groupId, userId });
                setConfirming(null);
              }}
            >
              {t("confirmRemove")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      <FormAlert message={transferError} />
      <FormAlert message={removeError} />
    </div>
  );
}
