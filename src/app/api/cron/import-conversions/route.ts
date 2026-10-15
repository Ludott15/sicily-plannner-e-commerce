import { NextResponse, type NextRequest } from "next/server";
import { runConversionImports } from "@/server/affiliates/conversions-cron.admin";
import { isAuthorizedCron } from "@/server/cron/auth";

// Cron giornaliero (vercel.json, 05:00 UTC): importa le conversioni dagli adattatori API configurati.
// Senza adattatori configurati risponde 200 con zero righe.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const partners = await runConversionImports(new Date());
  return NextResponse.json({ partners });
}
