import "server-only";
import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Link } from "@/lib/i18n/navigation";
import type { requireUser } from "@/server/auth";
import { getGroupLeaderboard } from "@/server/gamification/leaderboard";
import { cn } from "@/lib/utils";

// Classifica del gruppo (passo 5.3, riprogettata in 6.1). Due forme: "compact" nella Panoramica
// (le prime tre posizioni e il link alla scheda Classifica) e "full" nella sua scheda (tabella
// completa). Stati: caricamento (Suspense in pagina), errore (il servizio non risponde), vuoto
// (nessun punto nel periodo, o un solo membro: con uno solo la classifica non ha senso), lista.
// Solo i membri la vedono: getGroupLeaderboard rifiuta gli altri.
type GroupUser = Awaited<ReturnType<typeof requireUser>>;

const COMPACT_ROWS = 3;
const GROUPING = { useGrouping: "always" } as const;

export async function GroupLeaderboard({
  user,
  groupId,
  memberCount,
  variant,
}: {
  user: GroupUser;
  groupId: string;
  memberCount: number;
  variant: "compact" | "full";
}) {
  const [t, tGroups, format] = await Promise.all([
    getTranslations("Leaderboard"),
    getTranslations("Groups"),
    getFormatter(),
  ]);
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

  let body: ReactNode;
  if (memberCount < 2) {
    body = <p className="text-body text-lava-muted">{t("groupSolo")}</p>;
  } else if (board === null) {
    body = (
      <p role="alert" className="text-body text-lava-muted">
        {t("groupFailed")}
      </p>
    );
  } else if (board.rows.length === 0) {
    body = <p className="text-body text-lava-muted">{t("groupEmpty")}</p>;
  } else if (variant === "full") {
    body = <LeaderboardTable rows={board.rows} caption={t("groupCaption")} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ol className="flex flex-col divide-y divide-divider">
          {board.rows.slice(0, COMPACT_ROWS).map((row, index) => (
            <li
              key={`${row.rank}-${index}`}
              aria-current={row.isMe ? "true" : undefined}
              className={cn("flex items-baseline justify-between gap-4 py-3", row.isMe && "font-semibold")}
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="w-6 shrink-0 text-body-s tabular-nums text-lava-muted">{row.rank}</span>
                <span className="min-w-0 break-words">{row.publicName}</span>
                {row.isMe && <span className="text-caption uppercase text-lava-muted">{t("youLabel")}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{format.number(row.points, GROUPING)}</span>
            </li>
          ))}
        </ol>
        <div>
          <Link
            href={`/gruppi/${groupId}?scheda=classifica`}
            className="text-body-s font-semibold text-lava underline-offset-4 hover:underline"
          >
            {tGroups("v2.seeAllRanking")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="group-leaderboard" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="group-leaderboard" className="text-heading-3">
          {t("groupHeading")}
        </h2>
        {subtitle && <p className="text-body-s text-lava-muted">{subtitle}</p>}
      </div>
      {body}
    </section>
  );
}
