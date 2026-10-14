import { catalogImportTemplate } from "@/lib/catalog-import/columns";
import { requireAdmin } from "@/server/auth";

// Modello CSV da scaricare per l'importazione: solo l'intestazione. Solo admin.
export async function GET(): Promise<Response> {
  await requireAdmin();
  return new Response(catalogImportTemplate(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="catalogo-attivita.csv"',
      "Cache-Control": "no-store",
    },
  });
}
