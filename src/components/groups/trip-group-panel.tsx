"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { CreateGroupForm, MAX_GROUP_NAME } from "./create-group-form";

// Sezione "Viaggia in gruppo" della pagina del viaggio (1.4 / 4.1):
// - con gruppo: link al gruppo, a tutti i membri;
// - senza gruppo, owner non ospite: il form per crearlo, con il nome del viaggio;
// - ospite: invito a salvare l'account (un ospite non crea gruppi);
// - altrimenti (membro senza gruppo non può esistere): niente.
export type TripGroupPanelProps = {
  locale: string;
  tripId: string;
  tripTitle: string;
  group: { id: string; name: string } | null;
  isOwner: boolean;
  isGuest: boolean;
};

export function TripGroupPanel({ locale, tripId, tripTitle, group, isOwner, isGuest }: TripGroupPanelProps) {
  const t = useTranslations("Groups");
  const headingId = useId();

  if (group) {
    return (
      <p className="text-body">
        <Link href={`/gruppi/${group.id}`} className="font-semibold underline underline-offset-4">
          {t("tripGroupLink", { name: group.name })}
        </Link>
      </p>
    );
  }

  if (isGuest) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-4"
      >
        <h2 id={headingId} className="text-heading-3">
          {t("tripGroupHeading")}
        </h2>
        <p className="text-body text-lava-muted">{t("tripGroupGuest")}</p>
        <div>
          <ButtonLink href="/profilo" variant="secondary">
            {t("tripGroupGuestAction")}
          </ButtonLink>
        </div>
      </section>
    );
  }

  if (!isOwner) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-4"
    >
      <h2 id={headingId} className="text-heading-3">
        {t("tripGroupHeading")}
      </h2>
      <p className="text-body text-lava-muted">{t("tripGroupBody")}</p>
      <CreateGroupForm
        itineraryId={tripId}
        locale={locale}
        defaultName={tripTitle.slice(0, MAX_GROUP_NAME)}
      />
    </section>
  );
}
