"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { ActionMenu, type ActionMenuItem } from "@/components/layout/action-menu";
import { FormAlert } from "@/components/trips/trip-ui";
import { Dialog } from "@/components/ui/dialog";
import { leaveGroup } from "@/server/groups/actions";
import type { GroupFormState } from "@/server/groups/state";
import { RenameGroupForm } from "./rename-group-form";
import { useGroupAction } from "./use-group-action";

// Menu ⋯ della pagina del gruppo (brief 6.1): il link al viaggio collegato, poi Rinomina (solo
// per l'owner) oppure Esci dal gruppo (per i membri). Rinomina e uscita si confermano in un
// Dialog. Chi ha creato il gruppo non esce: la Panoramica lo dice (ownerLeaveHint), qui non
// compare la voce. Il menu resta montato con la pagina, così lo stato dell'uscita non si perde.
const IDLE: GroupFormState = { status: "idle" };

export type GroupMenuTrip = { id: string; title: string | null };

export function GroupMenu({
  groupId,
  locale,
  name,
  isOwner,
  trip,
}: {
  groupId: string;
  locale: string;
  name: string;
  isOwner: boolean;
  trip: GroupMenuTrip | null;
}) {
  const t = useTranslations("Groups");
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leave = useGroupAction<{ groupId: string; locale: string }, GroupFormState>(leaveGroup, IDLE);
  const leaveError = leave.state.status === "error" ? t(`errors.${leave.state.code}`) : null;

  const items: ActionMenuItem[] = [];
  if (trip) {
    items.push({
      kind: "link",
      href: `/viaggi/${trip.id}`,
      label: trip.title ? t("openTrip", { title: trip.title }) : t("openTripPlain"),
      icon: "map",
    });
  }
  if (isOwner) {
    if (trip) items.push({ kind: "separator" });
    items.push({ kind: "button", label: t("v2.rename"), icon: "pencil", onSelect: () => setRenaming(true) });
  } else {
    if (trip) items.push({ kind: "separator" });
    items.push({ kind: "button", label: t("leave"), icon: "logout", danger: true, onSelect: () => setLeaving(true) });
  }

  return (
    <>
      <ActionMenu variant="more" label={t("v2.menuLabel")} items={items} />

      <Dialog open={renaming} title={t("renameHeading")} onClose={() => setRenaming(false)}>
        <RenameGroupForm groupId={groupId} name={name} />
      </Dialog>

      <Dialog
        open={leaving}
        title={t("leaveHeading")}
        description={t("leaveText")}
        onClose={() => setLeaving(false)}
      >
        <div className="flex flex-col gap-4" aria-busy={leave.pending}>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={leave.pending} onClick={() => leave.run({ groupId, locale })}>
              {t("confirmLeave")}
            </Button>
            <Button variant="ghost" disabled={leave.pending} onClick={() => setLeaving(false)}>
              {t("cancel")}
            </Button>
          </div>
          <FormAlert message={leaveError} />
        </div>
      </Dialog>
    </>
  );
}
