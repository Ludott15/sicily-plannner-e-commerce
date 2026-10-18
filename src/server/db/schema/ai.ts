import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { itineraries } from "./trips";

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id").references(() => itineraries.id, { onDelete: "set null" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_sessions_user_id_idx").on(t.userId)],
);

// Scritti solo dal server (/api/chat). I token servono a misurare il costo per utente.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_session_created_idx").on(t.sessionId, t.createdAt),
    check("chat_messages_role_valid", sql`${t.role} in ('user', 'assistant', 'tool')`),
    check(
      "chat_messages_tokens_non_negative",
      sql`coalesce(${t.inputTokens}, 0) >= 0 and coalesce(${t.outputTokens}, 0) >= 0`,
    ),
  ],
);

// Modifiche proposte dal chatbot (passo 9.1). Scritte solo dalle funzioni SECURITY DEFINER
// create_chat_proposal e decide_chat_proposal (supabase/custom-chat.sql); lette dal proprietario.
export const chatProposals = pgTable(
  "chat_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("chat_proposals_session_created_idx").on(t.sessionId, t.createdAt),
    index("chat_proposals_message_id_idx").on(t.messageId),
    check("chat_proposals_kind_valid", sql`${t.kind} in ('itinerary', 'preference')`),
    check("chat_proposals_status_valid", sql`${t.status} in ('pending', 'accepted', 'rejected')`),
    check("chat_proposals_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`),
    check("chat_proposals_decided_consistent", sql`(${t.status} = 'pending') = (${t.decidedAt} is null)`),
  ],
);
