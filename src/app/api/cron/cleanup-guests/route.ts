import { NextResponse, type NextRequest } from "next/server";
import { deleteInactiveGuests } from "@/server/auth/guests.admin";
import { isAuthorizedCron } from "@/server/cron/auth";

// Cron giornaliero (vercel.json): elimina gli ospiti inattivi da 30 giorni con i loro dati.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const deleted = await deleteInactiveGuests();
  return NextResponse.json({ deleted });
}
