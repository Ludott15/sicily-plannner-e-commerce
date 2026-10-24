import type { ReactNode } from "react";
import { parseActivityRefs, type ChatActivityCard as ChatActivityCardData } from "@/lib/chat/events";
import { Logo } from "@/components/design";
import { ChatActivityCard } from "./chat-activity-card";

// Un messaggio della conversazione. Dell'utente: a destra, su una superficie tenue. Dell'assistente:
// senza bolla, testo pieno in tipografia di lettura, con il piccolo marchio a sinistra. Le schede
// (riferimenti [[activity:id]]) compaiono nel punto del testo in cui il modello le cita; una scheda
// non citata sta in fondo. "lead" è una riga di stato sopra la risposta (sta scrivendo, strumenti).
// Il testo è sempre testo React: nessun HTML dal modello.
export function ChatMessage({
  role,
  text,
  cards,
  lead,
  children,
}: {
  role: "user" | "assistant";
  text: string;
  cards: ChatActivityCardData[];
  lead?: ReactNode;
  children?: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="ml-auto flex max-w-[85%] min-w-0 flex-col items-end gap-1">
        <p className="rounded-lg bg-calce-sunk px-4 py-3 text-body break-words whitespace-pre-line text-lava">{text}</p>
      </div>
    );
  }

  const { segments } = parseActivityRefs(text);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const cited = new Set<string>();

  return (
    <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-3">
      <span aria-hidden="true" className="mt-[3px] flex text-heading-3 leading-none">
        <Logo variant="mark" />
      </span>
      <div className="flex min-w-0 flex-col gap-4">
        {lead}
        {segments.map((segment, index) => {
          if (segment.kind === "text") {
            const value = segment.text.trim();
            return value ? (
              <p key={index} className="max-w-[68ch] text-body-l break-words whitespace-pre-line text-lava">
                {value}
              </p>
            ) : null;
          }
          const card = byId.get(segment.id);
          if (!card) return null;
          cited.add(card.id);
          return <ChatActivityCard key={`${segment.id}-${index}`} card={card} />;
        })}
        {cards
          .filter((card) => !cited.has(card.id))
          .map((card) => (
            <ChatActivityCard key={card.id} card={card} />
          ))}
        {children}
      </div>
    </div>
  );
}
