import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { runAllPartnerImports } from "@/server/partners-import/run.admin";

// Cron notturno (vercel.json, 02:30): importa il catalogo di tutti i partner configurati, in
// sequenza. Senza chiavi API non fa nulla. Il tempo massimo per partner è in run.admin.ts.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await runAllPartnerImports();
  return NextResponse.json({
    partners: outcomes.map((outcome) =>
      outcome.status === "ok"
        ? { partner: outcome.partner, status: outcome.status, ...outcome.counts, newActivities: outcome.newActivities, tagsProposed: outcome.tagsProposed }
        : outcome.status === "failed"
          ? { partner: outcome.partner, status: outcome.status, error: outcome.error }
          : { partner: outcome.partner, status: outcome.status },
    ),
  });
}
