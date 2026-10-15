import "server-only";
import { getFormatter, getTranslations } from "next-intl/server";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import type { requireUser } from "@/server/auth";
import { getGroupLeaderboard } from "@/server/gamification/leaderboard";

// Classifica del gruppo (passo 5.3): i punti dei membri durante il viaggio del gruppo, nella pagina
// del gruppo. Stati: caricamento (Suspense in pagina), errore (il servizio non risponde), vuoto
// (nessun punto nel periodo, o un solo membro: con uno solo la classifica non ha senso), lista.
// Solo i membri la vedono: getGroupLeaderboard rifiuta gli altri.
type GroupUser = Awaited<ReturnType<typeof requireUser>>;

export async function GroupLeaderboard({
  user,
  groupId,
  memberCount,
}: {
  user: GroupUser;
  groupId: string;
  memberCount: number;
}) {
  const [t, format] = await Promise.all([getTranslations("Leaderboard"), getFormatter()]);
  const board = await getGroupLeaderboard(user, groupId).catch(() => null);

  const subtitle =
    board === null
      ? null
      : board.period
        ? t("groupPeriod", {
            from: format.dateTime(new Date(board.period.from), { dateStyle: "medium" }),
            to: format.dateTime(new Date(board.period.to), { dateStyle: "medium" }),
          })
        : t("groupSinceCreation");

  return (
    <section aria-labelledby="group-leaderboard" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="group-leaderboard" className="text-heading-3">
          {t("groupHeading")}
        </h2>
        {subtitle && <p className="text-body-s text-lava-muted">{subtitle}</p>}
      </div>
      {memberCount < 2 ? (
        <p className="text-body text-lava-muted">{t("groupSolo")}</p>
      ) : board === null ? (
        <p role="alert" className="text-body text-lava-muted">
          {t("groupFailed")}
        </p>
      ) : board.rows.length === 0 ? (
        <p className="text-body text-lava-muted">{t("groupEmpty")}</p>
      ) : (
        <LeaderboardTable rows={board.rows} caption={t("groupCaption")} />
      )}
    </section>
  );
}
