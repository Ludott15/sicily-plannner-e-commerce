import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/server/cron/auth";
import { sweepStaleCheckouts } from "@/server/shop/checkout-sweep.admin";

// Cron orario (vercel.json): chiude i checkout rimasti senza sessione Stripe e restituisce i punti.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const closed = await sweepStaleCheckouts();
  return NextResponse.json({ closed });
}
