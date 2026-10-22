import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { computeMissingLegs } from "@/server/maps/legs.admin";

// Cron orario (vercel.json): calcola le tratte stradali mancanti tra i luoghi del catalogo (prima quelle
// dei modelli). Il tempo massimo è BUDGET_MS = 240 s, sotto maxDuration = 300 s della funzione: dopo
// il budget non parte nuova richiesta, il resto si calcola al giro successivo. Il limite di 40 richieste
// con pausa di 1100 ms resta il tetto per giro.
const BUDGET_MS = 240_000;
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await computeMissingLegs(40, { budgetMs: BUDGET_MS });
  return NextResponse.json(result);
}
