import { NextResponse } from "next/server";
import { checkDatabase } from "@/server/health/database";

// GET /api/health (passo 11.5): 200 { ok: true, db: "ok" } se il database risponde, 503 altrimenti.
// Senza cache e senza dati sensibili: solo lo stato, mai versioni, nomi o errori del database.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const db = await checkDatabase();
  if (db === "ok") {
    return NextResponse.json({ ok: true, db: "ok" }, { status: 200, headers: NO_STORE });
  }
  return NextResponse.json({ ok: false, db: "error" }, { status: 503, headers: NO_STORE });
}
