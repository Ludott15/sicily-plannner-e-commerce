"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import type { ChatActivityCard, ChatProposal, ChatToolName } from "@/lib/chat/events";
import { GuestStart } from "@/components/auth/guest-start";
import { Button } from "@/components/design";
import { usePathname } from "@/lib/i18n/navigation";
import { ChatMessage } from "./chat-message";
import { ChatProposalCard } from "./chat-proposal-card";
import { readChatStream } from "./read-stream";

// Conversazione con l'assistente (contratto 9.1). Invia con POST /api/chat e legge lo stream NDJSON:
// il testo arriva a pezzi nel messaggio in corso (aria-live solo lì), gli strumenti mostrano
// cosa sta facendo l'assistente, "Interrompi" annulla la richiesta. Gli errori si leggono in
// parole semplici con "Riprova" quando ha senso. Il limite giornaliero blocca l'invio con l'ora di
// ripristino. Senza sessione (401) propone "Continua senza account" con il flusso ospite esistente.

// Come CHAT_MAX_INPUT_CHARS in src/server/chat/config.ts.
const MAX_INPUT_CHARS = 2000;

type ChatErrorCode =
  | "api_error"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "unauthenticated"
  | "invalid_request"
  | "session_not_found"
  | "chat_disabled"
  | "network"
  | "generic";

// Errori per cui "Riprova" non ha senso: o serve un'altra azione (accedere, attendere), o il
// messaggio non va bene così com'è.
const NO_RETRY: readonly ChatErrorCode[] = ["rate_limited", "unauthenticated", "invalid_request", "session_not_found", "chat_disabled"];

const EXAMPLES = ["example1", "example2", "example3"] as const;

export type ChatHistoryItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: ChatActivityCard[];
  createdAt: string;
};

type UiMessage = {
  key: string;
  id: string | null;
  role: "user" | "assistant";
  text: string;
  cards: ChatActivityCard[];
  proposals: ChatProposal[];
  status: "done" | "streaming" | "stopped" | "error";
  error: ChatErrorCode | null;
  resetAt: string | null;
};

export type ChatPanelProps = {
  sessionId?: string | null;
  itineraryId?: string | null;
  initialMessages?: ChatHistoryItem[];
  initialProposals?: ChatProposal[];
  enabled: boolean;
  remainingToday: number;
  limit: number;
  variant?: "page" | "sheet";
};

function fromHistory(item: ChatHistoryItem): UiMessage {
  return {
    key: `h-${item.id}`,
    id: item.id,
    role: item.role,
    text: item.text,
    cards: item.cards,
    proposals: [],
    status: "done",
    error: null,
    resetAt: null,
  };
}

function codeOfStatus(status: number): ChatErrorCode {
  if (status === 400) return "invalid_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "chat_disabled";
  if (status === 404) return "session_not_found";
  if (status === 429) return "rate_limited";
  return "generic";
}

function resetAtOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("resetAt" in body)) return null;
  return typeof body.resetAt === "string" ? body.resetAt : null;
}

export function ChatPanel({
  sessionId = null,
  itineraryId = null,
  initialMessages = [],
  initialProposals = [],
  enabled,
  remainingToday,
  limit,
  variant = "page",
}: ChatPanelProps) {
  const t = useTranslations("Chat");
  const format = useFormatter();
  const locale = useLocale() === "en" ? "en" : "it";
  const pathname = usePathname();
  const inputId = useId();
  const hintId = useId();

  const [messages, setMessages] = useState<UiMessage[]>(() => initialMessages.map(fromHistory));
  const [historyProposals] = useState<ChatProposal[]>(initialProposals);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<ChatToolName | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);
  const [limitHit, setLimitHit] = useState(false);
  const [needsSession, setNeedsSession] = useState(false);

  const keyRef = useRef(0);
  const sessionRef = useRef<string | null>(sessionId);
  const controllerRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollOnChange = useRef(false);

  // Non si scorre alla fine al primo montaggio (una conversazione salvata si apre dall'inizio);
  // poi si segue la risposta che arriva.
  useEffect(() => {
    if (!scrollOnChange.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [messages]);

  // Uscendo dalla pagina o chiudendo il pannello la richiesta in corso si annulla.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const exhausted = limitHit || (limit > 0 && remaining <= 0);
  const canType = enabled && !exhausted;

  async function send(rawText: string) {
    const message = rawText.trim();
    if (!message || streaming || !canType) return;

    const userKey = `u${++keyRef.current}`;
    const assistantKey = `a${++keyRef.current}`;
    scrollOnChange.current = true;
    setMessages((prev) => [
      ...prev,
      { key: userKey, id: null, role: "user", text: message, cards: [], proposals: [], status: "done", error: null, resetAt: null },
      { key: assistantKey, id: null, role: "assistant", text: "", cards: [], proposals: [], status: "streaming", error: null, resetAt: null },
    ]);
    setDraft("");
    setStreaming(true);
    setActiveTool(null);
    setNeedsSession(false);

    const controller = new AbortController();
    controllerRef.current = controller;
    let streamed = "";

    const update = (patch: Partial<UiMessage>) =>
      setMessages((prev) => prev.map((item) => (item.key === assistantKey ? { ...item, ...patch } : item)));

    const fail = (code: ChatErrorCode, resetAt: string | null = null) => {
      update({ status: "error", error: code, resetAt, text: streamed });
      if (code === "unauthenticated") setNeedsSession(true);
      if (code === "rate_limited") setLimitHit(true);
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionRef.current ?? undefined,
          itineraryId: itineraryId ?? undefined,
          message,
          locale,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body: unknown = await response.json().catch(() => null);
        fail(codeOfStatus(response.status), resetAtOf(body));
        return;
      }

      let finished = false;
      await readChatStream(response.body, (event) => {
        switch (event.type) {
          case "session":
            sessionRef.current = event.sessionId;
            return;
          case "text":
            streamed += event.delta;
            update({ text: streamed });
            return;
          case "tool":
            setActiveTool(event.status === "start" ? event.name : null);
            return;
          case "done":
            finished = true;
            setRemaining(event.remainingToday);
            update({
              id: event.messageId,
              text: event.text,
              cards: event.cards,
              proposals: event.proposals,
              status: "done",
            });
            return;
          case "error":
            finished = true;
            fail(event.code);
            return;
        }
      });
      if (!finished) fail("network");
      // Nella pagina di una nuova conversazione l'indirizzo diventa quello della sessione, ma solo a
      // risposta finita: Next sincronizza replaceState con il router e cambiare pagina a stream
      // aperto smonterebbe il pannello, annullando la richiesta.
      if (finished && variant === "page" && !sessionId && sessionRef.current) {
        window.history.replaceState(window.history.state, "", `/${locale}/chat/${sessionRef.current}`);
      }
    } catch {
      if (controller.signal.aborted) {
        update({ status: "stopped", text: streamed });
      } else {
        fail("network");
      }
    } finally {
      controllerRef.current = null;
      setStreaming(false);
      setActiveTool(null);
    }
  }

  // Riprova: toglie la coppia fallita e rimanda lo stesso testo.
  function retry(failed: UiMessage, index: number) {
    const previous = messages[index - 1];
    if (!previous || previous.role !== "user") return;
    setMessages((prev) => prev.filter((item) => item.key !== failed.key && item.key !== previous.key));
    void send(previous.text);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function errorText(code: ChatErrorCode): string {
    if (code === "invalid_request") return t("errors.invalid_request", { max: MAX_INPUT_CHARS });
    return t(`errors.${code}`);
  }

  const lastIndex = messages.length - 1;

  return (
    <div className={variant === "sheet" ? "flex h-full min-h-0 flex-col gap-4" : "flex min-w-0 flex-col gap-6"}>
      <div className={variant === "sheet" ? "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1" : "flex min-w-0 flex-col gap-6"}>
        {!enabled && (
          <p role="status" className="text-body text-lava-muted">
            {t("disabled")}
          </p>
        )}

        {enabled && messages.length === 0 && (
          <section aria-labelledby={`${inputId}-examples`} className="flex flex-col gap-3">
            <h2 id={`${inputId}-examples`} className="text-heading-3">
              {t("examplesTitle")}
            </h2>
            <ul className="flex flex-col items-stretch gap-2">
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <Button
                    variant="secondary"
                    className="h-auto w-full min-h-11 justify-start py-2 text-left whitespace-normal"
                    disabled={!canType || streaming}
                    onClick={() => void send(t(key))}
                  >
                    {t(key)}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {messages.length > 0 && (
          <ol className="flex min-w-0 flex-col gap-8">
            {messages.map((item, index) => (
              <li key={item.key} className="flex min-w-0 flex-col gap-4">
                {item.role === "user" ? (
                  <ChatMessage role="user" text={item.text} cards={[]} />
                ) : (
                  <div
                    aria-live={item.status === "streaming" ? "polite" : undefined}
                    aria-busy={item.status === "streaming"}
                    className="min-w-0"
                  >
                    <ChatMessage role="assistant" text={item.text} cards={item.cards}>
                      {item.status === "streaming" && (
                        <p className="flex items-center gap-2 text-body-s text-lava-muted">
                          <span aria-hidden="true" className="inline-flex gap-1">
                            <span className="size-1.5 rounded-pill bg-lava-muted motion-safe:animate-pulse" />
                            <span className="size-1.5 rounded-pill bg-lava-muted motion-safe:animate-pulse [animation-delay:150ms]" />
                          </span>
                          {activeTool ? t(`tools.${activeTool}`) : t("thinking")}
                        </p>
                      )}
                      {item.status === "stopped" && <p className="text-body-s text-lava-muted">{t("stopped")}</p>}
                      {item.status === "error" && item.error && (
                        <div className="flex flex-col items-start gap-3">
                          <p role="alert" className="flex items-start gap-2 text-body text-lava">
                            <AlertCircle size={20} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
                            <span className="min-w-0">{errorText(item.error)}</span>
                          </p>
                          {item.resetAt && (
                            <p className="text-body-s text-lava-muted">
                              {t("resetAt", {
                                time: format.dateTime(new Date(item.resetAt), { timeStyle: "short" }),
                              })}
                            </p>
                          )}
                          {!NO_RETRY.includes(item.error) && (
                            <Button variant="secondary" size="sm" disabled={streaming} onClick={() => retry(item, index)}>
                              {t("retry")}
                            </Button>
                          )}
                          {item.error === "unauthenticated" && needsSession && (
                            <div className="flex w-full max-w-[420px] flex-col gap-2">
                              <p className="text-body-s text-lava-muted">{t("guestPrompt")}</p>
                              <GuestStart locale={locale} next={pathname} />
                            </div>
                          )}
                        </div>
                      )}
                      {item.proposals.map((proposal) => (
                        <ChatProposalCard key={proposal.id} proposal={proposal} />
                      ))}
                    </ChatMessage>
                  </div>
                )}
                {index === lastIndex && <div ref={endRef} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}

        {historyProposals.length > 0 && (
          <div className="flex flex-col gap-4">
            {historyProposals.map((proposal) => (
              <ChatProposalCard key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}

        {exhausted && enabled && (
          <p role="status" className="text-body-s text-lava-muted">
            {t("errors.rate_limited")}
          </p>
        )}
      </div>

      {enabled && (
        <form ref={formRef} onSubmit={onSubmit} className="flex shrink-0 flex-col gap-2">
          <label htmlFor={inputId} className="text-body-s font-semibold text-lava">
            {t("inputLabel")}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={inputId}
              name="message"
              rows={2}
              maxLength={MAX_INPUT_CHARS}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              disabled={!canType}
              aria-describedby={hintId}
              className="min-h-11 min-w-0 flex-1 resize-y rounded-md border-[1.5px] border-border-control bg-calce-raised px-4 py-3 text-body text-lava placeholder:text-lava-muted focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60"
            />
            {streaming ? (
              <Button type="button" variant="secondary" onClick={() => controllerRef.current?.abort()}>
                {t("stop")}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!canType || draft.trim() === ""}>
                {t("send")}
              </Button>
            )}
          </div>
          <p id={hintId} className="text-caption text-lava-muted">
            {t("inputHint")}
            {limit > 0 && canType ? ` ${t("remaining", { count: remaining })}` : null}
          </p>
        </form>
      )}
    </div>
  );
}
