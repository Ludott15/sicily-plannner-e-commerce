import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { searchSite } from "@/server/search/queries";
import { allowSearchRequest, SUGGEST_RATE_RULE } from "@/server/search/rate-limit";

// Suggerimenti della ricerca nell'header (passo 11.2): tre risultati per tipo. Il limite per IP è
// di 120 richieste al minuto (fail open, come /api/go). Risposta: { groups } con il formato di
// SearchGroups (src/server/search/model.ts).

export const runtime = "nodejs";

const SUGGEST_PER_KIND = 3;
const NO_STORE = { "Cache-Control": "no-store" };

const querySchema = z.object({
  q: z.string().max(200),
  l: z.string().max(10).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    l: searchParams.get("l") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400, headers: NO_STORE });
  }

  const { q, l } = parsed.data;
  const locale = l !== undefined && hasLocale(routing.locales, l) ? l : routing.defaultLocale;

  if (!(await allowSearchRequest(request.headers, SUGGEST_RATE_RULE))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(SUGGEST_RATE_RULE.windowSeconds) } },
    );
  }

  try {
    const groups = await searchSite(q, locale, SUGGEST_PER_KIND);
    return NextResponse.json(
      { groups },
      { status: 200, headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    return NextResponse.json({ error: "search_failed" }, { status: 500, headers: NO_STORE });
  }
}
