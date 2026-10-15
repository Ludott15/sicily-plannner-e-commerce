import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

// Tabella della classifica (passo 5.3), usata nella pagina /classifica e in quella del gruppo.
// Server Component: nessuno stato. La posizione dell'utente è evidenziata con il token zagara-tint
// e con la parola "Tu" (non solo colore). Chi è ultimo in lista vede quanti punti gli mancano per
// salire, mai in rosso.

export type LeaderboardRow = {
  rank: number;
  publicName: string;
  points: number;
  isMe: boolean;
};

const GROUPING = { useGrouping: "always" } as const;

export async function LeaderboardTable({ rows, caption }: { rows: readonly LeaderboardRow[]; caption: string }) {
  const [t, format] = await Promise.all([getTranslations("Leaderboard"), getFormatter()]);
  const lastIndex = rows.length - 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse">
        <caption className="mb-3 text-left text-body-s text-lava-muted">{caption}</caption>
        <thead>
          <tr className="border-b border-divider text-left text-body-s text-lava-muted">
            <th scope="col" className="py-3 pr-4 font-semibold">
              {t("colRank")}
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              {t("colName")}
            </th>
            <th scope="col" className="py-3 text-right font-semibold">
              {t("colPoints")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const above = index > 0 ? rows[index - 1] : undefined;
            const gap = above ? above.points - row.points : 0;
            const showGap = row.isMe && index === lastIndex && gap > 0;
            return (
              <tr
                key={`${row.rank}-${index}`}
                aria-current={row.isMe ? "true" : undefined}
                className={cn("border-b border-divider", row.isMe && "bg-zagara-tint")}
              >
                <th scope="row" className="py-3 pr-4 font-normal tabular-nums">
                  {row.rank}
                </th>
                <td className="py-3 pr-4">
                  <span className={cn(row.isMe && "font-semibold")}>{row.publicName}</span>
                  {row.isMe && <span className="ml-2 text-caption uppercase text-lava-muted">{t("youLabel")}</span>}
                  {showGap && (
                    <span className="block text-body-s text-lava-muted">
                      {t("distanceToNext", { points: format.number(gap, GROUPING) })}
                    </span>
                  )}
                </td>
                <td className="py-3 text-right font-semibold tabular-nums">{format.number(row.points, GROUPING)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
