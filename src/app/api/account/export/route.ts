import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/server/auth";
import { buildAccountExport, exportAllowed, pointsCsv } from "@/server/privacy/export";

// Scarica i propri dati (passo 8.2). GET autenticato: formato=json (tutti i dati) oppure
// formato=csv (solo il ledger dei punti). Nessun file salvato: la risposta è il download. La quota è
// di EXPORT_DAILY_LIMIT richieste per utente nella finestra. Risposte: 200, 400, 401, 429, 500.
export const dynamic = "force-dynamic";

const querySchema = z.object({
  formato: z.enum(["json", "csv"]).default("json"),
});

const NO_STORE = "no-store";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse({ formato: request.nextUrl.searchParams.get("formato") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "invalid_format" }, { status: 400 });

  if (!(await exportAllowed(user))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": NO_STORE } });
  }

  try {
    const date = new Date().toISOString().slice(0, 10);
    if (parsed.data.formato === "csv") {
      const data = await buildAccountExport(user);
      return new NextResponse(pointsCsv(data.points), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="isula-punti-${date}.csv"`,
          "Cache-Control": NO_STORE,
        },
      });
    }

    const data = await buildAccountExport(user);
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="isula-dati-${date}.json"`,
        "Cache-Control": NO_STORE,
      },
    });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500, headers: { "Cache-Control": NO_STORE } });
  }
}
