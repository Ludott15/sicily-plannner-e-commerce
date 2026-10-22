import { type NextRequest, NextResponse } from "next/server";
import { getProfile, getUser } from "@/server/auth";
import { csvPeriodSchema, exportOrdersCsv } from "@/server/shop/orders.admin";

// CSV degli ordini per il commercialista (passo 7.3): GET ?from=AAAA-MM-GG&to=AAAA-MM-GG (estremi inclusi,
// fuso di Roma). Senza sessione: 401. Con una sessione che non è admin: 404, come il resto dell'area admin.
// Non usa requireAdmin, che reindirizza al login invece di rispondere con uno stato HTTP.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await getProfile(user);
  if (profile?.role !== "admin") return new NextResponse(null, { status: 404 });

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
