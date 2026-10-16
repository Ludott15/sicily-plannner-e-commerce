import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ChatStreamEvent } from "@/lib/chat/events";
import { getUser } from "@/server/auth";
import { dbAsUser, type UserTx } from "@/server/db/user";
import { chatEnabled, CHAT_MAX_INPUT_CHARS } from "@/server/chat/config";
import { runChatTurn } from "@/server/chat/stream";
import { checkChatRateLimit } from "@/server/chat/rate-limit";

// POST /api/chat (passo 9.1). Risposta 200 in NDJSON: una riga JSON per ChatStreamEvent. Gli errori
// prima dello stream sono JSON con lo stato HTTP: 400, 401, 403, 404, 429. Il runtime è Node
// (client Anthropic, Zod, drizzle), e la risposta non si mette in cache.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.uuid().optional(),
  itineraryId: z.uuid().optional(),
  message: z.string().trim().min(1).max(CHAT_MAX_INPUT_CHARS),
  locale: z.enum(["it", "en"]),
});

type SessionRow = { id: string; title: string | null; itinerary_id: string | null; itinerary_title: string | null };

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Sessione esistente (RLS: solo le proprie) oppure nuova, collegata a un viaggio accessibile.
async function resolveSession(
  user: { id: string; is_anonymous?: boolean },
  input: z.infer<typeof bodySchema>,
): Promise<SessionRow | "not_found" | "invalid"> {
  return dbAsUser(user, async (tx: UserTx) => {
    if (input.sessionId) {
      const [row] = await tx.execute<SessionRow>(sql`
        select s.id, s.title, s.itinerary_id, i.title as itinerary_title
        from public.chat_sessions s
        left join public.itineraries i on i.id = s.itinerary_id
        where s.id = ${input.sessionId}::uuid`);
      return row ?? "not_found";
    }
    const t = await getTranslations({ locale: input.locale, namespace: "Chat.server" });
    const title = t("defaultTitle");
    try {
      const [created] = await tx.execute<{ id: string }>(sql`
        insert into public.chat_sessions (id, user_id, itinerary_id, title)
        values (gen_random_uuid(), ${user.id}::uuid, ${input.itineraryId ?? null}::uuid, ${title})
        returning id`);
      if (!created) return "invalid";
      const [row] = await tx.execute<SessionRow>(sql`
        select s.id, s.title, s.itinerary_id, i.title as itinerary_title
        from public.chat_sessions s
        left join public.itineraries i on i.id = s.itinerary_id
        where s.id = ${created.id}::uuid`);
      return row ?? "invalid";
    } catch {
      // Viaggio non accessibile: RLS sull'inserimento.
      return "invalid";
    }
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!chatEnabled()) return json({ error: "chat_disabled" }, 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  const user = await getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  const limit = await checkChatRateLimit(user, request.headers);
  if (!limit.allowed) return json({ error: "rate_limited", resetAt: limit.resetAt }, 429);

  const session = await resolveSession(user, parsed.data);
  if (session === "not_found") return json({ error: "session_not_found" }, 404);
  if (session === "invalid") return json({ error: "invalid_request" }, 400);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Il client può chiudere la connessione in qualunque momento: scrivere o chiudere uno stream
      // chiuso lancia un errore, che qui si ignora (il turno continua e salva comunque il risultato).
      const emit = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client disconnesso: nessun evento da consegnare.
        }
      };
      try {
        await runChatTurn(
          {
            user,
            sessionId: session.id,
            title: session.title,
            itineraryId: session.itinerary_id,
            itineraryTitle: session.itinerary_title,
            locale: parsed.data.locale,
            text: parsed.data.message,
            signal: request.signal,
          },
          emit,
        );
      } finally {
        try {
          controller.close();
        } catch {
          // Già chiuso dal client: niente da fare.
        }
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
