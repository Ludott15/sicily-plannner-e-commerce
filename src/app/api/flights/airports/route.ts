import { NextResponse, type NextRequest } from "next/server";
import { searchAirportsForCombobox } from "@/server/flights/airport-search";

// GET /api/flights/airports?q=… : al massimo 12 aeroporti di partenza per la combobox voli.
// Risposta pubblica e cacheabile (il risultato dipende solo da q). 400 se q è troppo lungo.
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const result = searchAirportsForCombobox({ q });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(
    { airports: result.airports },
    { status: 200, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
