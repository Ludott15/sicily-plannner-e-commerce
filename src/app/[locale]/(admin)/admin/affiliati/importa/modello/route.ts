import { conversionImportTemplate } from "@/lib/affiliate-conversions/template";
import { requireAdmin } from "@/server/auth";

// Modello CSV da scaricare per l'importazione delle conversioni: intestazione e due righe di prova.
// Solo admin.
export async function GET(): Promise<Response> {
  await requireAdmin();
  return new Response(conversionImportTemplate(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="conversioni-modello.csv"',
      "Cache-Control": "no-store",
    },
  });
}
