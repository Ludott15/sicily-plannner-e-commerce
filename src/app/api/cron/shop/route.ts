import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { runOrdersCron } from "@/server/shop/orders-cron.admin";

// Cron orario (vercel.json): avviso per i fornitori in ritardo e consegna automatica degli ordini spediti
// da oltre 10 giorni, con i punti (passo 7.3).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runOrdersCron(new Date());
  return NextResponse.json(report);
}
