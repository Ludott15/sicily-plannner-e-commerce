import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChatPanel } from "@/components/chat/chat-panel";
import { requireUser } from "@/server/auth";
import { chatStatus } from "@/server/chat/queries";

// Assistente (passo 9.1): una conversazione nuova, pronta per la prima domanda. L'elenco delle conversazioni
// salvate sta nel layout (colonna a sinistra su desktop, sheet su mobile). Vale per ospiti e account: la
// pagina richiede solo una sessione, che l'ospite ha già.
type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ChatPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, status] = await Promise.all([getTranslations("Chat"), chatStatus(user)]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1 text-lava">{t("title")}</h1>
        <p className="text-body text-lava-muted">{t("intro")}</p>
      </header>
      <ChatPanel variant="page" enabled={status.enabled} remainingToday={status.remainingToday} limit={status.limit} />
    </div>
  );
}
