import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatSessionActions } from "@/components/chat/chat-session-actions";
import { requireUser } from "@/server/auth";
import { chatStatus, getChatSession } from "@/server/chat/queries";

// Una conversazione salvata (passo 9.1). Solo il proprietario la apre: getChatSession legge con dbAsUser,
// quindi per chiunque altro la sessione non esiste (404). Le proposte in attesa restano valide finché
// non si rispondono; i messaggi riassunti non compaiono. Il titolo è in testa, le azioni nel menu "...".
type Props = { params: Promise<{ locale: string; sessionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ChatSessionPage({ params }: Props) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const user = await requireUser();
  const [session, status, t] = await Promise.all([
    getChatSession(user, sessionId),
    chatStatus(user),
    getTranslations("Chat"),
  ]);
  if (!session) notFound();

  const title = session.title ?? t("untitled");

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col gap-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="is-display min-w-0 text-heading-2 break-words text-lava">{title}</h1>
        <ChatSessionActions sessionId={session.id} title={session.title ?? ""} />
      </header>
      <ChatPanel
        variant="page"
        sessionId={session.id}
        itineraryId={session.itineraryId}
        initialMessages={session.messages}
        initialProposals={session.proposals}
        enabled={status.enabled}
        remainingToday={session.remainingToday}
        limit={status.limit}
      />
    </div>
  );
}
