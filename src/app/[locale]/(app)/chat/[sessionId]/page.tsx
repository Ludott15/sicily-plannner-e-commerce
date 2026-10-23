import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatSessionActions } from "@/components/chat/chat-session-actions";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth";
import { chatStatus, getChatSession } from "@/server/chat/queries";

// Una conversazione salvata (passo 9.1). Solo il proprietario la apre: getChatSession legge con dbAsUser,
// quindi per chiunque altro la sessione non esiste (404). Le proposte in attesa restano valide finché
// non si rispondono; i messaggi riassunti non compaiono.
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
    <PageContainer width="prose" className="pb-24 md:pb-12">
      <PageHeader
        title={title}
        breadcrumb={[{ label: t("title"), href: "/chat" }]}
        breadcrumbLabel={t("title")}
        menu={<ChatSessionActions sessionId={session.id} title={session.title ?? ""} />}
      />
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
    </PageContainer>
  );
}
