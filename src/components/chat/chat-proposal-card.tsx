"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { ChatProposal, ItineraryChange } from "@/lib/chat/events";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { acceptChatProposal, rejectChatProposal } from "@/server/chat/actions";

// Proposta di modifica (itinerario o gusti) con anteprima delle modifiche. Nulla cambia finché l'utente
// non accetta: Accetta/Rifiuta partono da onSubmit con startTransition (mai <form action>), così un
// errore non azzera la scelta. Dopo "Accetta" su un itinerario il viaggio si ricarica.
type Status = ChatProposal["status"];

export function ChatProposalCard({ proposal }: { proposal: ChatProposal }) {
  const t = useTranslations("Chat.proposal");
  const headingId = useId();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(proposal.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const decision = submitter instanceof HTMLButtonElement ? submitter.value : "";
    if (decision !== "accepted" && decision !== "rejected") return;
    const data = new FormData();
    data.set("proposalId", proposal.id);
    setError(null);
    startTransition(async () => {
      const result = decision === "accepted" ? await acceptChatProposal(data) : await rejectChatProposal(data);
      if (result.status === "ok") {
        setStatus(decision);
        if (decision === "accepted" && proposal.kind === "itinerary") router.refresh();
        return;
      }
      setError(result.code === "chat_proposal_decided" ? t("alreadyDecided") : t("error"));
    });
  }

  const title = proposal.kind === "itinerary" ? t("title") : t("titlePreference");

  function describeChange(change: ItineraryChange): string {
    if (change.op === "add") return t("add", { title: change.title, day: change.dayIndex + 1 });
    if (change.op === "remove") return t("remove", { title: change.title });
    return t("move", { title: change.title, day: change.dayIndex + 1, position: change.position + 1 });
  }

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-divider bg-calce-raised p-4">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-body font-semibold text-lava">
          {title}
        </h3>
        {status === "pending" && <p className="text-body-s text-lava-muted">{t("pending")}</p>}
      </div>

      {proposal.kind === "itinerary" ? (
        <>
          <ul className="flex flex-col gap-2 text-body text-lava">
            {proposal.changes.map((change, index) => (
              <li key={`${change.op}-${index}`} className="break-words">
                {describeChange(change)}
              </li>
            ))}
          </ul>
          {proposal.asGroupProposal && <p className="text-body-s text-lava-muted">{t("groupNote")}</p>}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-body text-lava">
            {t("preference", { label: proposal.interestLabel, from: proposal.from, to: proposal.to })}
          </p>
          {proposal.reason && <p className="text-body-s text-lava-muted break-words">{t("reason", { reason: proposal.reason })}</p>}
        </div>
      )}

      {status === "pending" ? (
        <form onSubmit={onSubmit} className="flex flex-wrap gap-2" aria-busy={pending}>
          <Button type="submit" name="decision" value="accepted" variant="primary" size="md" disabled={pending}>
            {t("accept")}
          </Button>
          <Button type="submit" name="decision" value="rejected" variant="secondary" size="md" disabled={pending}>
            {t("reject")}
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 text-body-s font-semibold text-lava">
          {status === "accepted" && <Check size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />}
          {status === "accepted" ? (proposal.kind === "itinerary" ? t("accepted") : t("acceptedPreference")) : t("rejected")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-body-s text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

