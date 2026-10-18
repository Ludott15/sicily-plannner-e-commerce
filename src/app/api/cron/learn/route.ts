import { NextResponse, type NextRequest } from "next/server";
import { runLearning } from "@/server/personalization/learn.admin";
import { isAuthorizedCron } from "@/server/cron/auth";

// Cron notturno (vercel.json, 03:30): pesi impliciti e embedding del profilo dagli eventi nuovi.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runLearning());
}
