"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { ChatSessionActions } from "./chat-session-actions";
import { groupSessionsByAge, type ChatSessionListItem, type SessionGroupKey } from "./group-sessions";

// Elenco delle conversazioni salvate, raggruppate per Oggi / Ultimi 7 giorni / Prima (brief B). Il titolo
// è troncato su una riga; rinomina ed elimina stanno nel menu "..." della riga. Serve sia nella colonna
// laterale sia nello sheet del mobile: onNavigate chiude lo sheet quando si sceglie una conversazione.
// Il gruppo dipende dall'ora di chi guarda: sul server, e nel primo render del client, l'elenco è piatto
// nello stesso ordine; poi, dopo l'idratazione, si raggruppa (nessun mismatch con il fuso del server).

// Lo snapshot è il minuto corrente: stabile tra due letture dello stesso render.
const MINUTE_MS = 60_000;
const subscribeNever = () => () => {};
const minuteNow = () => Math.floor(Date.now() / MINUTE_MS);
const noMinute = () => null;

export function ChatSessionList({
  sessions,
  onNavigate,
}: {
  sessions: readonly ChatSessionListItem[];
  onNavigate?: () => void;
}) {
  const t = useTranslations("Chat");
  const pathname = usePathname();
  const minute = useSyncExternalStore(subscribeNever, minuteNow, noMinute);

  if (sessions.length === 0) {
    return <p className="text-body-s text-lava-muted">{t("listEmpty")}</p>;
  }

  const groups: { key: SessionGroupKey | null; items: readonly ChatSessionListItem[] }[] =
    minute === null ? [{ key: null, items: sessions }] : groupSessionsByAge(sessions, new Date(minute * MINUTE_MS));

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key ?? "all"} className="flex flex-col gap-1">
          {group.key && <h2 className="px-3 pb-1 text-label text-lava-muted">{t(`groups.${group.key}`)}</h2>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((session) => {
              const href = `/chat/${session.id}`;
              const active = pathname === href;
              return (
                <li key={session.id}>
                  <div className="is-chat-row" data-active={active ? "true" : "false"}>
                    <Link href={href} className="is-chat-row__link" aria-current={active ? "page" : undefined} onClick={onNavigate}>
                      {session.title ?? t("untitled")}
                    </Link>
                    {/* Su desktop le azioni stanno nell'intestazione della conversazione aperta: la colonna non le ripete.
                        Dove c'è lo sheet (mobile) la riga le mostra. */}
                    <div className="md:hidden">
                      <ChatSessionActions sessionId={session.id} title={session.title ?? ""} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
