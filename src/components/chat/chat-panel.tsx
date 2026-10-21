"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AlertCircle, ArrowDown, ArrowUpRight } from "lucide-react";
import type { ChatActivityCard, ChatProposal, ChatToolName } from "@/lib/chat/events";
import { GuestStart } from "@/components/auth/guest-start";
import { Button } from "@/components/design";
import { useRouter, usePathname } from "@/lib/i18n/navigation";
import { ChatComposer } from "./chat-composer";
import { ChatCopyButton } from "./chat-copy-button";
import { ChatMessage } from "./chat-message";
import { ChatProposalCard } from "./chat-proposal-card";
import { readChatStream } from "./read-stream";

// Conversazione con l'assistente (contratto 9.1). Invia con POST /api/chat e legge lo stream NDJSON:
// il testo arriva a pezzi nel messaggio in corso (aria-live solo lì), gli strumenti mostrano
// cosa sta facendo l'assistente, "Interrompi" annulla la richiesta. Gli errori si leggono in
// parole semplici con "Riprova" quando ha senso. Il limite giornaliero blocca l'invio con l'ora di
// ripristino. Senza sessione (401) propone "Continua senza account" con il flusso ospite esistente.
// Lo scroll segue la risposta finché l'utente è in fondo; se risale compare "Ultimi messaggi".

// Come CHAT_MAX_INPUT_CHARS in src/server/chat/config.ts.
const MAX_INPUT_CHARS = 2000;
// Sotto questa distanza dal fondo la pagina si considera "in fondo".
const NEAR_BOTTOM_PX = 96;

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

const EXAMPLES = ["example1", "example2", "example3", "example4"] as const;

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
  const router = useRouter();
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
  const [atBottom, setAtBottom] = useState(true);

  const keyRef = useRef(0);
  const sessionRef = useRef<string | null>(sessionId);
  const controllerRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // true quando l'utente è in fondo: solo allora la risposta che arriva trascina lo scroll.
  const followRef = useRef(true);
  // Non si scorre alla fine al primo montaggio (una conversazione salvata si apre dall'inizio);
  // dopo un invio si segue la risposta.
  const followOnChange = useRef(false);

  // Lo scroll è dell'intera finestra (pagina) o del riquadro dei messaggi nella variante "sheet".
  useEffect(() => {
    const isSheet = variant === "sheet";
    const target: EventTarget | null = isSheet ? scrollerRef.current : window;
    if (!target) return;
    const distanceFromBottom = () => {
      const box = scrollerRef.current;
      if (isSheet && box) return box.scrollHeight - box.scrollTop - box.clientHeight;
      return document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    };
    const onScroll = () => {
      const near = distanceFromBottom() < NEAR_BOTTOM_PX;
      followRef.current = near;
      setAtBottom(near);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [variant]);

  useEffect(() => {
    if (!followOnChange.current || !followRef.current) return;
    // Istantaneo: uno scorrimento animato farebbe scattare il controllo "in fondo" a metà corsa.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Uscendo dalla pagina o chiudendo il pannello la richiesta in corso si annulla.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const exhausted = limitHit || (limit > 0 && remaining <= 0);
  const canType = enabled && !exhausted;

  function jumpToLatest() {
    followRef.current = true;
    setAtBottom(true);
    endRef.current?.scrollIntoView({ block: "end" });
  }

  async function send(rawText: string) {
    const message = rawText.trim();
    if (!message || streaming || !canType) return;

    const userKey = `u${++keyRef.current}`;
    const assistantKey = `a${++keyRef.current}`;
    followOnChange.current = true;
    followRef.current = true;
    setAtBottom(true);
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
    let createdSession = false;

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
            if (!sessionRef.current) createdSession = true;
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
      // aperto smonterebbe il pannello, annullando la richiesta. Poi l'elenco laterale si rinfresca.
      if (finished && variant === "page" && !sessionId && sessionRef.current) {
        window.history.replaceState(window.history.state, "", `/${locale}/chat/${sessionRef.current}`);
        if (createdSession) router.refresh();
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

  function errorText(code: ChatErrorCode): string {
    if (code === "invalid_request") return t("errors.invalid_request", { max: MAX_INPUT_CHARS });
    return t(`errors.${code}`);
  }

  const lastIndex = messages.length - 1;
  const remainingText = limit > 0 && canType ? t("remaining", { count: remaining }) : null;
  const isSheet = variant === "sheet";

  return (
    <div className={isSheet ? "flex h-full min-h-0 flex-col" : "flex min-w-0 flex-col gap-8"}>
      <div
        ref={scrollerRef}
        className={isSheet ? "flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pr-1" : "flex min-w-0 flex-col gap-8"}
      >
        {!enabled && (
          <p role="status" className="text-body text-lava-muted">
            {t("disabled")}
          </p>
        )}

        {enabled && messages.length === 0 && (
          <section aria-labelledby={`${inputId}-examples`} className="flex flex-col gap-8 pt-2 md:pt-6">
            <p className="is-display text-heading-2 text-lava">
              {t("greeting")}
            </p>
            <div className="flex flex-col gap-3">
              <h2 id={`${inputId}-examples`} className="text-label text-lava-muted">
                {t("examplesTitle")}
              </h2>
              <ul className="is-chat-suggest">
                {EXAMPLES.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="is-chat-suggest__item"
                      disabled={!canType || streaming}
                      onClick={() => void send(t(key))}
                    >
                      <span className="min-w-0">{t(key)}</span>
                      <ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
                    <ChatMessage
                      role="assistant"
                      text={item.text}
                      cards={item.cards}
                      lead={
                        item.status === "streaming" ? (
                          <p className="flex items-center gap-2 text-body-s text-lava-muted">
                            <span aria-hidden="true" className="inline-flex gap-1">
                              <span className="size-1.5 rounded-pill bg-lava-muted motion-safe:animate-pulse" />
                              <span className="size-1.5 rounded-pill bg-lava-muted motion-safe:animate-pulse [animation-delay:150ms]" />
                            </span>
                            {activeTool ? t(`tools.${activeTool}`) : t("thinking")}
                          </p>
                        ) : null
                      }
                    >
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
                      {item.status === "done" && item.text && <ChatCopyButton text={item.text} />}
                    </ChatMessage>
                  </div>
                )}
                {index === lastIndex && <div ref={endRef} aria-hidden="true" className="scroll-mb-40" />}
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
        <div
          className={
            isSheet
              ? "flex shrink-0 flex-col gap-2 pt-3"
              : "sticky bottom-[calc(56px_+_env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 bg-calce px-4 pt-3 pb-4 md:bottom-0 md:mx-0 md:px-0 md:pb-8"
          }
        >
          {!atBottom && messages.length > 0 && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={jumpToLatest}>
                <ArrowDown size={16} strokeWidth={1.5} aria-hidden="true" />
                {t("jumpToLatest")}
              </Button>
            </div>
          )}
          <ChatComposer
            inputId={inputId}
            hintId={hintId}
            value={draft}
            maxLength={MAX_INPUT_CHARS}
            canType={canType}
            streaming={streaming}
            remainingText={remainingText}
            onChange={setDraft}
            onSend={() => void send(draft)}
            onStop={() => controllerRef.current?.abort()}
          />
        </div>
      )}
    </div>
  );
}
