import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { asc } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";
import { activityTagProposals, interests } from "@/server/db/schema";
import {
  buildTagRequest,
  interpretTagReply,
  type InterestOption,
  type TagModelClient,
  type TagOutcome,
  type TagProductInput,
  type TagStrength,
} from "./tags";

// Chiamata al modello per le proposte di tag (solo dal cron e dall'admin, con dbAdmin).
// Le proposte restano in activity_tag_proposals: diventano tag solo con "Conferma tag".

export const TAG_MODEL = "claude-haiku-5-5";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 1024;

export type TagRequestOutcome = TagOutcome | { status: "error"; code: "rate_limited" | "api_error" };

export type ProposalRow = { activityId: string; interestKey: string; strength: TagStrength };

// Client reale: Anthropic SDK, output strutturato con lo schema Zod. Le eccezioni dell'SDK
// arrivano al chiamante, che le classifica in requestActivityTags.
export function createAnthropicTagClient(apiKey: string): TagModelClient {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return {
    async parse(request) {
      const response = await client.messages.parse({
        model: TAG_MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low", format: zodOutputFormat(request.schema) },
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.user }],
      });
      return { stop_reason: response.stop_reason, parsed_output: response.parsed_output };
    },
  };
}

export async function loadTagInterests(): Promise<InterestOption[]> {
  const rows = await dbAdmin
    .select({ key: interests.key, labelIt: interests.labelIt })
    .from(interests)
    .orderBy(asc(interests.sort), asc(interests.key));
  return rows;
}

// Una chiamata per attività. Errori tipizzati (limite di frequenza, errore API) diventano un
// esito, mai un'eccezione: l'import continua senza proposte per quell'attività.
export async function requestActivityTags(
  client: TagModelClient,
  product: TagProductInput,
  interestOptions: readonly InterestOption[],
): Promise<TagRequestOutcome> {
  const request = buildTagRequest(product, interestOptions);
  if (request === null) return { status: "empty" };
  try {
    const reply = await client.parse(request);
    return interpretTagReply(reply, interestOptions);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { status: "error", code: "rate_limited" };
    return { status: "error", code: "api_error" };
  }
}

// Scrive le proposte in un'unica query; le proposte già presenti per la stessa coppia restano.
export async function saveTagProposals(rows: readonly ProposalRow[]): Promise<void> {
  if (rows.length === 0) return;
  await dbAdmin
    .insert(activityTagProposals)
    .values(rows.map((row) => ({ ...row, model: TAG_MODEL })))
    .onConflictDoNothing();
}
