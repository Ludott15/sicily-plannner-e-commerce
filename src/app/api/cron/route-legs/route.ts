import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { computeMissingLegs } from "@/server/maps/legs.admin";

// Cron orario (vercel.json): calcola le tratte stradali mancanti tra le tappe degli itinerari.
// Il limite (40 richieste con pausa di 1100 ms) sta nel tempo massimo della funzione.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await computeMissingLegs();
  return NextResponse.json(result);
}
