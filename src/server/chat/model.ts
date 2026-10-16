import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey, chatTestModelActive, CHAT_MAX_RETRIES, CHAT_MAX_TOKENS, CHAT_MODEL, CHAT_SHORT_MODEL, CHAT_TIMEOUT_MS } from "./config";
import { scriptedModel } from "./test-model";

// Adattatore del modello (passo 9.1). Il resto del chatbot vede solo ModelTurn: il client reale
// (Anthropic, streaming con finalMessage) e il modello di prova (test-model.ts) implementano la
// stessa interfaccia. Nessun dato del database passa da qui oltre al contesto già costruito.

export type ModelTurn = {
  // Blocchi da riportare nella conversazione (testo, tool_use, thinking) così come sono.
  content: Anthropic.ContentBlockParam[];
  text: string;
  toolUses: { id: string; name: string; input: unknown }[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
};

export type TurnRequest = {
  // Blocco statico (regole): ha il punto di cache.
  system: string;
  // Blocco dinamico (data, lingua, profilo, riassunto): dopo il punto di cache.
  dynamicSystem: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
};

export type ShortRequest = { system: string; user: string; maxTokens: number };

export interface ChatModel {
  turn(request: TurnRequest, onText: (delta: string) => void, signal?: AbortSignal): Promise<ModelTurn>;
  short(request: ShortRequest): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

let client: Anthropic | null = null;

// Client condiviso: chiave da ANTHROPIC_API_KEY, timeout e un solo tentativo in più.
export function anthropicClient(): Anthropic {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error("anthropic_key_missing");
  if (!client) client = new Anthropic({ apiKey, timeout: CHAT_TIMEOUT_MS, maxRetries: CHAT_MAX_RETRIES });
  return client;
}

// Il punto di cache sull'ultima definizione di strumento: così tutta la parte statica è in cache.
function withCacheOnLastTool(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.map((tool, index) =>
    index === tools.length - 1 ? { ...tool, cache_control: { type: "ephemeral" } } : tool,
  );
}

export const anthropicModel: ChatModel = {
  async turn(request, onText, signal) {
    const stream = anthropicClient().messages.stream(
      {
        model: CHAT_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: [
          { type: "text", text: request.system, cache_control: { type: "ephemeral" } },
          { type: "text", text: request.dynamicSystem },
        ],
        tools: withCacheOnLastTool(request.tools),
        messages: request.messages,
      },
      { signal },
    );
    stream.on("text", onText);
    const message = await stream.finalMessage();

    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    const toolUses = message.content.flatMap((block) =>
      block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : [],
    );
    return {
      content: message.content,
      text,
      toolUses,
      stopReason: message.stop_reason,
      inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
    };
  },

  async short({ system, user, maxTokens }) {
    const message = await anthropicClient().messages.create({
      model: CHAT_SHORT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
  },
};

// Il modello di prova è attivo solo fuori da Vercel con CHAT_TEST_MODEL=scripted.
export function chatModel(): ChatModel {
  return chatTestModelActive() ? scriptedModel : anthropicModel;
}
