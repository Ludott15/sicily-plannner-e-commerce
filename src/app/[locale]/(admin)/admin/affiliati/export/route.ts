import { getTranslations } from "next-intl/server";
import { type NextRequest } from "next/server";
import { resolvePeriod } from "@/lib/affiliate-conversions/period";
import { requireAdmin } from "@/server/auth";
import { EXPORT_ROW_LIMIT, exportConversionsCsv } from "@/server/affiliates/conversions-dashboard.admin";

// Esportazione CSV delle conversioni del periodo: GET ?da=AAAA-MM-GG&a=AAAA-MM-GG (o giorni=7|30|90).
// Parametri non validi ricadono sul periodo predefinito. Solo admin. Oltre EXPORT_ROW_LIMIT righe
// risponde 422 con un testo semplice (non un CSV parziale).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
): Promise<Response> {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const period = resolvePeriod(
    { giorni: params.get("giorni"), da: params.get("da"), a: params.get("a") },
    new Date(),
  );
  const result = await exportConversionsCsv(period);
  if (result.status === "too_many_rows") {
    const { locale } = await context.params;
    const t = await getTranslations({ locale, namespace: "AdminAffiliates" });
    return new Response(t("exportTooManyRows", { limit: EXPORT_ROW_LIMIT }), {
      status: 422,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversioni-${period.from}-${period.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
