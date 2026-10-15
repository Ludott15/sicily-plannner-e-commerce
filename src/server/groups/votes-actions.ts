"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { dbAsUser } from "@/server/db/user";

// Voti sulle tappe di un viaggio di gruppo (passo 4.2). Zod → requireUser → dbAsUser. La RLS di
// item_votes (can_vote_item, ospiti esclusi) è la seconda difesa. Null cancella il proprio voto.

export type VoteErrorCode = "invalid" | "guest_not_allowed" | "not_allowed" | "failed";

export type VoteResult = { status: "ok" } | { status: "error"; code: VoteErrorCode };

const voteSchema = z.object({
  itemId: z.uuid(),
  value: z.union([z.literal(1), z.literal(-1), z.null()]),
});

// Violazione della RLS (42501) = non si può votare questa tappa; il resto è un errore tecnico.
function voteErrorCodeOf(error: unknown): VoteErrorCode {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "42501") return "not_allowed";
    current = cause;
  }
  return "failed";
}

export async function setItemVote(input: { itemId: string; value: 1 | -1 | null }): Promise<VoteResult> {
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  if (user.is_anonymous) return { status: "error", code: "guest_not_allowed" };
  const { itemId, value } = parsed.data;
  try {
    await dbAsUser(user, (tx) =>
      value === null
        ? tx.execute(sql`
            delete from public.item_votes
            where itinerary_item_id = ${itemId}::uuid and user_id = ${user.id}::uuid`)
        : tx.execute(sql`
            insert into public.item_votes (itinerary_item_id, user_id, value)
            values (${itemId}::uuid, ${user.id}::uuid, ${value}::smallint)
            on conflict (itinerary_item_id, user_id) do update set value = excluded.value`),
    );
  } catch (error) {
    return { status: "error", code: voteErrorCodeOf(error) };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}
