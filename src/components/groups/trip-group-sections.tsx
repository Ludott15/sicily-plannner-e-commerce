"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FormAlert } from "@/components/trips/trip-ui";
import { decideProposal, type ProposalFormState } from "@/server/groups/proposals-actions";
import type { TripGroupState } from "@/server/groups/trip-group";
import { dayOf, textOf } from "./payload";
import { useGroupAction } from "./use-group-action";

// Sezioni del viaggio di gruppo nella scheda Gruppo (6.1): le proposte (il proprietario accetta o rifiuta;
// gli altri vedono le proprie in attesa) e le modifiche recenti, come frasi composte dal tipo di modifica e
// dal payload. Un'azione senza un nome dà "Qualcuno", mai un id. Niente contenitori annidati: sezioni con
// titolo e righe separate da un divider, una per riga a tutta larghezza.

export type TripProposal = TripGroupState["proposals"][number];
export type TripChange = TripGroupState["changes"][number];

export type TripGroupSectionsProps = {
  proposals: TripProposal[];
  changes: TripChange[];
  isGroupOwner: boolean;
};

const IDLE: ProposalFormState = { status: "idle" };

export function TripGroupSections({ proposals, changes, isGroupOwner }: TripGroupSectionsProps) {
  const t = useTranslations("Groups");
  const visible = isGroupOwner ? proposals : proposals.filter((proposal) => proposal.mine);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="group-proposals" className="flex flex-col gap-4">
        <h2 id="group-proposals" className="text-heading-3">
          {t("proposalsHeading")}
        </h2>
        {visible.length === 0 ? (
          <p className="text-body text-lava-muted">{t("proposalsEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} isGroupOwner={isGroupOwner} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="group-changes" className="flex flex-col gap-4">
        <h2 id="group-changes" className="text-heading-3">
          {t("changesHeading")}
        </h2>
        {changes.length === 0 ? (
          <p className="text-body text-lava-muted">{t("changesEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {changes.map((change) => (
              <li key={change.id} className="border-b border-divider py-3 text-body last:border-b-0">
                <ChangeLine change={change} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProposalRow({ proposal, isGroupOwner }: { proposal: TripProposal; isGroupOwner: boolean }) {
  const t = useTranslations("Groups");
  const decision = useGroupAction<{ proposalId: string; accept: boolean }, ProposalFormState>(decideProposal, IDLE);
  const day = proposal.dayIndex + 1;
  const meta = proposal.mine
    ? t("proposalMine", { day })
    : t("proposalMeta", { day, name: proposal.proposedByName ?? t("someone") });

  return (
    <li className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      <p className="text-body font-semibold">{proposal.title}</p>
      <p className="text-body-s text-lava-muted">{meta}</p>
      {isGroupOwner && (
        <div className="flex flex-wrap gap-3 pt-1">
          <Button
            variant="primary"
            disabled={decision.pending}
            onClick={() => decision.run({ proposalId: proposal.id, accept: true })}
          >
            {t("accept")}
          </Button>
          <Button
            variant="secondary"
            disabled={decision.pending}
            onClick={() => decision.run({ proposalId: proposal.id, accept: false })}
          >
            {t("reject")}
          </Button>
        </div>
      )}
      <FormAlert
        message={decision.submitted && decision.state.status === "error" ? t(`proposalErrors.${decision.state.code}`) : null}
      />
    </li>
  );
}

function ChangeLine({ change }: { change: TripChange }) {
  const t = useTranslations("Groups");
  const name = change.actorName ?? t("someone");
  const payload = change.payload;
  const title = textOf(payload, "title", t("someStop"));
  const day = dayOf(payload, "day");

  switch (change.kind) {
    case "stop_added":
      return <>{t("changes.stopAdded", { name, title, day })}</>;
    case "stop_removed":
      return <>{t("changes.stopRemoved", { name, title })}</>;
    case "stop_moved":
      return <>{t("changes.stopMoved", { name, title, day })}</>;
    case "stop_replaced":
      return (
        <>
          {t("changes.stopReplaced", {
            name,
            before: textOf(payload, "before", t("someStop")),
            after: textOf(payload, "after", t("someStop")),
          })}
        </>
      );
    case "day_added":
      return <>{t("changes.dayAdded", { name, day })}</>;
    case "day_removed":
      return <>{t("changes.dayRemoved", { name, day })}</>;
    case "proposal_accepted":
      return <>{t("changes.proposalAccepted", { name, title, day })}</>;
    default:
      return <>{t("changes.generic", { name })}</>;
  }
}
