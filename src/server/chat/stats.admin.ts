import "server-only";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { AI_PRICES, CHAT_MODEL } from "./config";

// Costi del chatbot per l'admin (passo 9.1). Ruolo postgres (dbAdmin), solo dopo requireAdmin.
// Solo metadati: data, utente (iniziali o id breve), conteggi e token. Mai il contenuto dei messaggi.
// Il costo è una stima: token × prezzo indicativo del modello di chat (AI_PRICES), senza distinguere
// le letture dalla cache, che il database non registra.

export type AiCostDay = { day: string; messages: number; inputTokens: number; outputTokens: number; costUsd: number };
export type AiCostUser = { userLabel: string; sessions: number; messages: number; inputTokens: number; outputTokens: number; costUsd: number };
export type AiLatestSession = {
  id: string;
  createdAt: string;
  userLabel: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

// Stima in dollari di un insieme di token (usata anche dalla dashboard admin).
export function costOf(inputTokens: number, outputTokens: number): number {
  const price = AI_PRICES[CHAT_MODEL];
  if (!price) return 0;
  return Math.round(((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * 10_000) / 10_000;
}

// Iniziali del nome visualizzato, o i primi 8 caratteri dell'id se manca.
export function userLabelOf(displayName: string | null, id: string): string {
  const initials = (displayName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
  return initials || id.slice(0, 8);
}

function clampDays(days: number): number {
  return Math.min(Math.max(Math.trunc(days), 1), 365);
}

export async function aiCostByDay(days: number): Promise<AiCostDay[]> {
  await requireAdmin();
  const rows = await dbAdmin.execute<{ day: string; messages: number; input_tokens: number; output_tokens: number }>(sql`
    select to_char(date_trunc('day', m.created_at at time zone 'Europe/Rome'), 'YYYY-MM-DD') as day,
      count(*)::int as messages,
      coalesce(sum(m.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(m.output_tokens), 0)::bigint as output_tokens
    from public.chat_messages m
    where m.role = 'assistant' and coalesce(m.content->>'kind', '') <> 'summary'
      and m.created_at >= now() - make_interval(days => ${clampDays(days)})
    group by 1
    order by 1 desc`);
  return rows.map((row) => {
    const input = Number(row.input_tokens);
    const output = Number(row.output_tokens);
    return { day: row.day, messages: Number(row.messages), inputTokens: input, outputTokens: output, costUsd: costOf(input, output) };
  });
}

export async function aiCostByUser(days: number, limit: number): Promise<AiCostUser[]> {
  await requireAdmin();
  const rows = await dbAdmin.execute<{
    user_id: string | null;
    display_name: string | null;
    sessions: number;
    messages: number;
    input_tokens: number;
    output_tokens: number;
  }>(sql`
    select s.user_id, p.display_name,
      count(distinct s.id)::int as sessions,
      count(m.id)::int as messages,
      coalesce(sum(m.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(m.output_tokens), 0)::bigint as output_tokens
    from public.chat_messages m
    join public.chat_sessions s on s.id = m.session_id
    left join public.profiles p on p.id = s.user_id
    where m.role = 'assistant' and coalesce(m.content->>'kind', '') <> 'summary'
      and m.created_at >= now() - make_interval(days => ${clampDays(days)})
    group by s.user_id, p.display_name
    order by sum(coalesce(m.input_tokens, 0) + coalesce(m.output_tokens, 0)) desc nulls last
    limit ${Math.min(Math.max(Math.trunc(limit), 1), 200)}`);
  return rows.map((row) => {
    const input = Number(row.input_tokens);
    const output = Number(row.output_tokens);
    return {
      userLabel: userLabelOf(row.display_name, row.user_id ?? "anonimo"),
      sessions: Number(row.sessions),
      messages: Number(row.messages),
      inputTokens: input,
      outputTokens: output,
      costUsd: costOf(input, output),
    };
  });
}

export async function latestChatSessions(limit: number): Promise<AiLatestSession[]> {
  await requireAdmin();
  const rows = await dbAdmin.execute<{
    id: string;
    created_at: string;
    user_id: string | null;
    display_name: string | null;
    messages: number;
    input_tokens: number;
    output_tokens: number;
  }>(sql`
    select s.id, s.created_at, s.user_id, p.display_name,
      count(m.id) filter (where m.role in ('user', 'assistant') and coalesce(m.content->>'kind', '') <> 'summary')::int as messages,
      coalesce(sum(m.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(m.output_tokens), 0)::bigint as output_tokens
    from public.chat_sessions s
    left join public.chat_messages m on m.session_id = s.id
    left join public.profiles p on p.id = s.user_id
    group by s.id, s.created_at, s.user_id, p.display_name
    order by s.created_at desc
    limit ${Math.min(Math.max(Math.trunc(limit), 1), 200)}`);
  return rows.map((row) => {
    const input = Number(row.input_tokens);
    const output = Number(row.output_tokens);
    return {
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      userLabel: userLabelOf(row.display_name, row.user_id ?? "anonimo"),
      messageCount: Number(row.messages),
      inputTokens: input,
      outputTokens: output,
      costUsd: costOf(input, output),
    };
  });
}
