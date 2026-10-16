import "server-only";
import { getTranslations } from "next-intl/server";
import type { requireUser } from "@/server/auth";
import { proposalTexts } from "@/components/proposals/proposal-texts";
import { getGroupProposals } from "@/server/groups/proposals-group";
import { GroupProposalCard } from "./group-proposal-card";

// "Ecco tre viaggi per il gruppo" (brief 6.1, scheda "Viaggi proposti"): le tre proposte una sotto
// l'altra, a tutta larghezza (mai colonne strette). Ogni proposta è una GroupProposalCard con le
// tappe in "Vedi le tappe". Con meno di 3 membri (reasonsMode "logistic") il motore lascia solo i
// motivi pratici e la pagina lo dice. Nessun pulsante di salvataggio in questo passo.
// Stati: caricamento (Suspense in pagina), errore, vuoto, lista.
type GroupUser = Awaited<ReturnType<typeof requireUser>>;

export async function GroupProposals({ user, groupId, locale }: { user: GroupUser; groupId: string; locale: string }) {
  const t = await getTranslations("Groups");
  const [tProposals, texts, result] = await Promise.all([
    getTranslations("Proposals"),
    proposalTexts(locale),
    getGroupProposals(user, groupId).catch(() => null),
  ]);

  if (!result) {
    return (
      <section aria-labelledby="group-proposals" className="flex flex-col gap-3">
        <h2 id="group-proposals" className="is-display text-heading-2">
          {t("tripsHeading")}
        </h2>
        <p role="alert" className="text-body text-lava-muted">
          {t("proposalsFailed")}
        </p>
      </section>
    );
  }

  const { proposals, days, shortened, reasonsMode } = result;

  return (
    <section aria-labelledby="group-proposals" className="flex flex-col gap-6">
      <div className="max-w-[680px]">
        <h2 id="group-proposals" className="is-display text-heading-2">
          {t("tripsHeading")}
        </h2>
        <p className="mt-2 text-body text-pretty text-lava-muted">{t("proposalsIntro")}</p>
      </div>

      {reasonsMode === "logistic" && (
        <p role="note" className="max-w-[680px] rounded-lg bg-calce-sunk p-4 text-body">
          {t("logisticNote")}
        </p>
      )}
      {shortened && (
        <p role="note" className="max-w-[680px] rounded-lg bg-calce-sunk p-4 text-body">
          {tProposals("shortened", { days })}
        </p>
      )}

      {proposals.length === 0 ? (
        <p className="text-body-l">{t("tripsEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-10">
          {proposals.map((proposal, i) => (
            <GroupProposalCard
              key={`${proposal.area}:${proposal.variant ?? ""}`}
              proposal={proposal}
              index={i}
              texts={texts}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
