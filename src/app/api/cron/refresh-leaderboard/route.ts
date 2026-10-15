import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { dbAdmin } from "@/server/db/admin";

// Refresh manuale (quello ogni 15 minuti lo fa pg_cron nel database): ricalcola i totali della classifica stagionale
// (leaderboard_season_totals) con refresh_leaderboard, che usa REFRESH ... CONCURRENTLY
// perché la vista ha un indice unico. Senza Authorization valida risponde 401.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await dbAdmin.execute(sql`select public.refresh_leaderboard()`);
  } catch {
    return NextResponse.json({ error: "refresh_failed" }, { status: 500 });
  }
  return NextResponse.json({ refreshed: true });
}
