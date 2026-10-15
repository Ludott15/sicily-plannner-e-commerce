import { NextResponse, type NextRequest } from "next/server";
import { runActivityEmbeddings } from "@/server/embeddings/embed.admin";
import { isAuthorizedCron } from "@/server/cron/auth";

// Cron notturno (vercel.json, 04:00): calcola gli embedding delle attività nuove o cambiate.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runActivityEmbeddings());
}
