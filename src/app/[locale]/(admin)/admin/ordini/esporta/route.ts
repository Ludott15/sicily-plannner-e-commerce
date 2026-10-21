import { type NextRequest, NextResponse } from "next/server";
import { exportOrdersCsv, csvPeriodSchema } from "@/server/shop/orders.admin";

// CSV degli ordini per il commercialista (passo 7.3): GET ?from=AAAA-MM-GG&to=AAAA-MM-GG (estremi inclusi,
// fuso di Roma). Solo admin: exportOrdersCsv chiama requireAdmin, che interrompe la richiesta per un non admin
// (come nel resto dell'area admin).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const period = csvPeriodSchema.safeParse({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to"),
  });
  if (!period.success || period.data.from > period.data.to) {
    return NextResponse.json({ error: "invalid_period" }, { status: 400 });
  }
  const csv = await exportOrdersCsv(period.data);
  const filename = `ordini-${period.data.from}-${period.data.to}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
