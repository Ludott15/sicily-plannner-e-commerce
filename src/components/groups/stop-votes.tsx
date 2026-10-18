"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, StopVotes } from "@/components/design";
import { FormAlert } from "@/components/trips/trip-ui";
import { replaceStop, type ProposalFormState } from "@/server/groups/proposals-actions";
import { setItemVote, type VoteResult } from "@/server/groups/votes-actions";
import { useGroupAction } from "./use-group-action";

// Voti di una tappa nel viaggio di gruppo: StopVotes del design system (controllato), con i valori
// ottimistici (useOptimistic) e il ritorno allo stato del server se l'azione fallisce. Sotto la tappa,
// solo se ci sono alternative vicine, l'elenco con titolo, luogo e distanza; solo l'owner del gruppo può
// sostituire la tappa con una di quelle. In riga compatta: i voti restano sotto il luogo della tappa.

export type StopVoteCounts = { up: number; down: number; mine: 1 | -1 | null };

export type StopAlternative = { activityId: string; title: string; placeName: string; distanceKm: number };

export type GroupStopVotesProps = {
  itemId: string;
  votes: StopVoteCounts;
  members: number;
  alternatives: StopAlternative[];
  isGroupOwner: boolean;
};

type Side = "up" | "down";
type VoteErrorCode = Extract<VoteResult, { status: "error" }>["code"];

const IDLE: ProposalFormState = { status: "idle" };
const VALUE: Record<Side, 1 | -1> = { up: 1, down: -1 };

function sideOf(mine: 1 | -1 | null): Side | null {
  return mine === 1 ? "up" : mine === -1 ? "down" : null;
}

// Stato dopo un voto: il voto precedente si toglie; il nuovo (se c'è) si aggiunge. Premere di nuovo
// lo stesso pulsante annulla il voto (StopVotes passa null).
function applyVote(current: StopVoteCounts, next: Side | null): StopVoteCounts {
  const previous = sideOf(current.mine);
  return {
    up: current.up - (previous === "up" ? 1 : 0) + (next === "up" ? 1 : 0),
    down: current.down - (previous === "down" ? 1 : 0) + (next === "down" ? 1 : 0),
    mine: next === null ? null : VALUE[next],
  };
}

export function GroupStopVotes({ itemId, votes, members, alternatives, isGroupOwner }: GroupStopVotesProps) {
  const t = useTranslations("Groups");
  const format = useFormatter();
  const [optimistic, setOptimistic] = useOptimistic(votes, (_current: StopVoteCounts, next: StopVoteCounts) => next);
  const [pending, startTransition] = useTransition();
  const [voteError, setVoteError] = useState<VoteErrorCode | null>(null);
  const replace = useGroupAction<{ itemId: string; activityId: string }, ProposalFormState>(replaceStop, IDLE);

  // onVote di StopVotes: "up", "down" oppure null (annullamento del voto già dato).
  function vote(next: Side | null) {
    setVoteError(null);
    startTransition(async () => {
      setOptimistic(applyVote(optimistic, next));
      const result = await setItemVote({ itemId, value: next === null ? null : VALUE[next] });
      if (result.status === "error") setVoteError(result.code);
    });
  }

  const myVote: Side | null = sideOf(optimistic.mine);

  return (
    <div className="flex flex-col gap-2" aria-busy={pending}>
      <StopVotes
        up={optimistic.up}
        down={optimistic.down}
        members={members}
        myVote={myVote}
        onVote={vote}
        alternatives={alternatives.length}
      />

      {alternatives.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-body-s font-semibold">{t("alternativesLabel")}</p>
          <ul className="flex flex-col">
            {alternatives.map((alternative) => (
              <li
                key={alternative.activityId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-divider py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold">{alternative.title}</p>
                  <p className="text-body-s text-lava-muted">
                    {t("alternativeMeta", {
                      place: alternative.placeName,
                      km: format.number(alternative.distanceKm, { maximumFractionDigits: 1 }),
                    })}
                  </p>
                </div>
                {isGroupOwner && (
                  <Button
                    variant="secondary"
                    disabled={replace.pending}
                    onClick={() => replace.run({ itemId, activityId: alternative.activityId })}
                  >
                    {t("replaceAction", { title: alternative.title })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormAlert message={voteError ? t(`voteErrors.${voteError}`) : null} />
      <FormAlert
        message={replace.submitted && replace.state.status === "error" ? t(`proposalErrors.${replace.state.code}`) : null}
      />
    </div>
  );
}
