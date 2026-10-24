import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { ChatSessionList } from "@/components/chat/chat-session-list";
import { ChatSessionsSheet } from "@/components/chat/chat-sessions-sheet";
import { ButtonLink } from "@/components/design";
import { requireUser } from "@/server/auth";
import { listChatSessions } from "@/server/chat/queries";

// Assistente (passo 9.1, redesign): su desktop due colonne, con l'elenco delle conversazioni a sinistra
// (260-280 px) e la conversazione a destra; su mobile la conversazione a tutta larghezza e l'elenco in uno
// sheet aperto dalla barra in cima. L'elenco è letto qui e condiviso da /chat e /chat/[sessionId]: dopo una
// nuova conversazione o un'eliminazione la pagina chiama router.refresh().
type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function ChatLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, sessions] = await Promise.all([getTranslations("Chat"), listChatSessions(user)]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 md:grid md:grid-cols-[272px_minmax(0,1fr)] md:gap-x-12 md:px-16 md:py-12">
      <aside
        aria-label={t("sessionsTitle")}
        className="hidden md:sticky md:top-20 md:flex md:max-h-[calc(100dvh_-_6rem)] md:flex-col md:gap-5 md:overflow-y-auto"
      >
        <ButtonLink href="/chat" variant="secondary" className="w-full justify-start">
          <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          {t("newConversation")}
        </ButtonLink>
        <ChatSessionList sessions={sessions} />
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <ChatSessionsSheet sessions={sessions} />
          <ButtonLink href="/chat" variant="ghost" size="sm" className="-mr-2">
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
            {t("newConversation")}
          </ButtonLink>
        </div>
        {children}
      </div>
    </div>
  );
}
