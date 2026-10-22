import { NextResponse, type NextRequest } from "next/server";
import { searchAirportsForCombobox } from "@/server/flights/airport-search";
import { AIRPORT_RULE, checkRate, ipIdentity } from "@/server/security/rate-limit";

// GET /api/flights/airports?q=… : al massimo 12 aeroporti di partenza per la combobox voli.
// Risposta pubblica e cacheabile (il risultato dipende solo da q). 400 se q è troppo lungo.
export const runtime = "nodejs";

// Limite per IP (120 al minuto). Un contatore non disponibile non blocca la combobox (fail open): i dati
// sono pubblici e la risposta è cacheata. Il 429 viene dopo la validazione di q, come gli altri 400.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const result = searchAirportsForCombobox({ q });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const ip = ipIdentity(request.headers);
  if (ip !== null && (await checkRate(AIRPORT_RULE, ip)) === "limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(AIRPORT_RULE.windowSeconds) } },
    );
  }
  return NextResponse.json(
    { airports: result.airports },
    { status: 200, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
