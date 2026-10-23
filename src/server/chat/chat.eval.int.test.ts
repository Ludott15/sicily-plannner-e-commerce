import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activityRefIds } from "@/lib/chat/events";
import { findBannedContent } from "@/lib/chat/banned-words";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import type { ChatStreamEvent } from "@/lib/chat/events";
import { runChatTurn } from "./stream";
import { chatModel } from "./model";

// Valutazione del chatbot (passo 9.1): 20 richieste di evals/chat/requests.json con il modello
// vero. Salta senza ANTHROPIC_API_KEY. Per ogni richiesta controlla:
//   - ogni [[activity:id]] nel testo è un id restituito da uno strumento della stessa sessione;
//   - nessuna parola o frase vietata dal manuale, nessun URL nel testo;
//   - nessun errore del turno.
// Gli utenti e le sessioni sono int-eval-…: la pulizia li elimina.

type Request = { id: string; category: string; locale: "it" | "en"; message: string; itinerary?: boolean };

const requests = JSON.parse(readFileSync(join(process.cwd(), "evals", "chat", "requests.json"), "utf8")) as Request[];
const URL_PATTERN = /https?:\/\/|www\./i;
const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const user: DbUser = { id: randomUUID(), email: `int-eval-${SUFFIX}@example.com` };

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)("valutazione del chatbot", () => {
  beforeAll(async () => {
    await dbAdmin.execute(sql`insert into auth.users (id, email, raw_user_meta_data)
      values (${user.id}, ${user.email}, '{"full_name": "Valutazione"}')`);
  });

  afterAll(async () => {
    await dbAdmin.execute(sql`delete from auth.users where id = ${user.id}`);
  });

  for (const request of requests) {
    it(`${request.id} (${request.category})`, async () => {
      const sessionId = randomUUID();
      let itineraryId: string | null = null;
      if (request.itinerary) {
        itineraryId = randomUUID();
        await dbAdmin.execute(sql`insert into public.itineraries (id, owner_id, title, days)
          values (${itineraryId}::uuid, ${user.id}::uuid, ${`int-eval-viaggio-${request.id}-${SUFFIX}`}, 2)`);
      }
      await dbAdmin.execute(sql`insert into public.chat_sessions (id, user_id, itinerary_id, title)
        values (${sessionId}::uuid, ${user.id}::uuid, ${itineraryId}::uuid, ${`int-eval-${request.id}-${SUFFIX}`})`);

      const events: ChatStreamEvent[] = [];
      const deltas: string[] = [];
      await runChatTurn(
        {
          user,
          sessionId,
          title: null,
          itineraryId,
          itineraryTitle: null,
          locale: request.locale,
          text: request.message,
        },
        (event) => {
          events.push(event);
          if (event.type === "text") deltas.push(event.delta);
        },
        chatModel(),
      );

      const errors = events.filter((event) => event.type === "error");
      expect(errors, `errore del turno per ${request.id}`).toEqual([]);
      const done = events.find((event) => event.type === "done");
      expect(done?.type).toBe("done");
      if (done?.type !== "done") return;

      // Testo grezzo del modello (prima della pulizia del server).
      const raw = deltas.join("");
      expect(URL_PATTERN.test(raw), "URL nel testo").toBe(false);
      expect(findBannedContent(raw), "parole o forme vietate").toEqual([]);

      // Id citati: solo quelli restituiti dagli strumenti di questa sessione.
      const [toolRow] = await dbAsUser(user, (tx) =>
        tx.execute<{ tool_calls: { tools?: { activityIds?: string[] }[] } | null }>(sql`
          select tool_calls from public.chat_messages where id = ${done.messageId}::uuid`),
      );
      const returned = new Set((toolRow?.tool_calls?.tools ?? []).flatMap((tool) => tool.activityIds ?? []));
      for (const id of activityRefIds(raw)) {
        expect(returned.has(id), `riferimento non restituito da uno strumento: ${id}`).toBe(true);
      }
    }, 120_000);
  }
});
