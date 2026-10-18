import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { runRetention } from "@/server/privacy/retention.admin";

// Cron giornaliero (vercel.json): applica i tempi di conservazione (docs/PRIVACY-TECNICA.md).
// Nel log solo i conteggi per lavoro, mai i dati.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcome = await runRetention();
  console.info(JSON.stringify({ cron: "retention", changed: outcome }));
  return NextResponse.json({ outcome });
}
