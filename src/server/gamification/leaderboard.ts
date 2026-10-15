import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isSeasonKey, seasonOf } from "@/lib/seasons";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";

// Letture delle classifiche (passo 5.3). Tutto passa dalle funzioni SQL SECURITY DEFINER di
// supabase/migrations/20261015184024_classifiche.sql, che restituiscono solo i campi pubblici: posizione, nome pubblico,
// punti e is_me. Mai email, mai id utente, mai lo storico dei movimenti.

export type LeaderboardRow = { rank: number; publicName: string; points: number; isMe: boolean };

type TopRow = { rank: number; public_name: string; points: number; is_me: boolean };

// Quante righe mostra la classifica stagionale pubblica.
const SEASONAL_LIMIT = 50;

// Classifica stagionale: primi 50 non in opt-out della stagione (default: quella corrente, ora
// italiana). Una chiave di stagione non valida ricade sulla stagione corrente.
// Con l'utente, `me` è la sua posizione anche se è in opt-out; gli ospiti non la vedono (null).
// Senza utente (visitatore) la lettura passa da dbPublic: il ruolo anon legge la lista.
export async function getSeasonalLeaderboard(
  user: DbUser | null,
  season?: string,
): Promise<{
  season: string;
  rows: LeaderboardRow[];
  me: { rank: number; points: number } | null;
}> {
  const key = season !== undefined && isSeasonKey(season) ? season : seasonOf(new Date());

  if (user === null) {
    const rows = await dbPublic((tx) => selectSeasonalTop(tx, key));
    return { season: key, rows, me: null };
  }

  return dbAsUser(user, async (tx) => {
    const rows = await selectSeasonalTop(tx, key);
    const me = user.is_anonymous ? null : await selectMyRank(tx, key);
    return { season: key, rows, me };
  });
}

async function selectSeasonalTop(tx: UserTx, season: string): Promise<LeaderboardRow[]> {
  const rows = await tx.execute<TopRow>(
    sql`select rank, public_name, points, is_me from public.seasonal_leaderboard_top(${season}, ${SEASONAL_LIMIT})`,
  );
  return Array.from(rows, (row) => ({
    rank: row.rank,
    publicName: row.public_name,
    points: row.points,
    isMe: row.is_me,
  }));
}

async function selectMyRank(tx: UserTx, season: string): Promise<{ rank: number; points: number } | null> {
  const rows = await tx.execute<{ rank: number; points: number }>(
    sql`select rank, points from public.my_seasonal_rank(${season})`,
  );
  const [row] = Array.from(rows);
  return row ? { rank: row.rank, points: row.points } : null;
}

// Classifica di un gruppo: punti dei membri attuali nel periodo del viaggio (vedi
// group_leaderboard in custom-53.sql). Solo per i membri: per gli altri la funzione SQL lancia
// not_group_member (P0001), che il chiamante deve gestire. Un id non valido dà un risultato vuoto.
export async function getGroupLeaderboard(
  user: DbUser,
  groupId: string,
): Promise<{
  rows: LeaderboardRow[];
  period: { from: string; to: string } | null;
}> {
  const parsed = z.uuid().safeParse(groupId);
  if (!parsed.success) return { rows: [], period: null };

  type GroupRow = TopRow & { period_from: string; period_to: string };
  return dbAsUser(user, async (tx) => {
    const rows = Array.from(
      await tx.execute<GroupRow>(
        sql`select rank, public_name, points, is_me,
              to_char(period_from, 'YYYY-MM-DD') as period_from,
              to_char(period_to, 'YYYY-MM-DD') as period_to
            from public.group_leaderboard(${parsed.data}::uuid)`,
      ),
    );
    const first = rows[0];
    return {
      rows: rows.map((row) => ({
        rank: row.rank,
        publicName: row.public_name,
        points: row.points,
        isMe: row.is_me,
      })),
      period: first ? { from: first.period_from, to: first.period_to } : null,
    };
  });
}

// Impostazioni dell'utente per la pagina preferenze: opt-out, nome scelto e nome pubblico calcolato
// dal database (con il ripiego sul nome dell'account). Lancia se il profilo non esiste.
export async function getLeaderboardSettings(
  user: DbUser,
): Promise<{ optOut: boolean; displayName: string | null; publicName: string }> {
  const rows = await dbAsUser(user, (tx) =>
    tx.execute<{ opt_out: boolean; display_name: string | null; public_name: string }>(
      sql`select opt_out, display_name, public_name from public.my_leaderboard_settings()`,
    ),
  );
  const [row] = Array.from(rows);
  if (!row) throw new Error("profile_not_found");
  return { optOut: row.opt_out, displayName: row.display_name, publicName: row.public_name };
}
