"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { ActionMenu } from "@/components/layout/action-menu";
import { FormAlert } from "@/components/trips/trip-ui";
import { Dialog } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import { removeMember, transferOwnership } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// Azioni dell'owner su un membro (brief 6.1: ogni membro ha il suo menu ⋯): rendere proprietario
// o rimuovere. Ogni azione si conferma in un Dialog; se riesce, la pagina si ricarica dal server.
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
    <div className="flex flex-col items-end gap-2" aria-busy={busy}>
      <ActionMenu
        variant="more"
        label={t("v2.memberMenu", { name })}
        items={[
          {
            kind: "button",
            label: t("makeOwner"),
            icon: "users",
            disabled: busy,
            onSelect: () => setConfirming("transfer"),
          },
          {
            kind: "button",
            label: t("remove"),
            icon: "trash",
            danger: true,
            disabled: busy,
            onSelect: () => setConfirming("remove"),
          },
        ]}
      />
      <FormAlert message={transferError} />
      <FormAlert message={removeError} />

      <Dialog
        open={confirming === "transfer"}
        title={t("makeOwner")}
        description={t("confirmTransferText", { name })}
        onClose={() => setConfirming(null)}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              transfer.run({ groupId, userId });
              setConfirming(null);
            }}
          >
            {t("confirmTransfer")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirming === "remove"}
        title={t("remove")}
        description={t("confirmRemoveText", { name })}
        onClose={() => setConfirming(null)}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              remove.run({ groupId, userId });
              setConfirming(null);
            }}
          >
            {t("confirmRemove")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            {t("cancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
