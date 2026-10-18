import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { requireUser } from "@/server/auth";
import { chatStatus, listChatSessions } from "@/server/chat/queries";

// Assistente (passo 9.1): elenco delle conversazioni salvate e "Nuova conversazione". Con
// ?nuova=1, o quando non ce ne sono, il pannello è pronto per la prima domanda. Vale per ospiti e
// account: la pagina richiede solo una sessione, che l'ospite ha già.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ nuova?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ChatPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { nuova } = await searchParams;
  const user = await requireUser();
  const [t, format, status, sessions] = await Promise.all([
    getTranslations("Chat"),
    getFormatter(),
    chatStatus(user),
    listChatSessions(user),
  ]);

  const newing = nuova === "1" || sessions.length === 0;

  return (
    <PageContainer width="prose" className="pb-24 md:pb-12">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        primaryAction={
          newing ? (
            sessions.length > 0 ? (
              <ButtonLink href="/chat" variant="secondary">
                {t("backToList")}
              </ButtonLink>
            ) : undefined
          ) : (
            <ButtonLink href="/chat?nuova=1" variant="secondary">
              {t("newConversation")}
            </ButtonLink>
          )
        }
      />

      {newing ? (
        <ChatPanel
          variant="page"
          initialMessages={[]}
          enabled={status.enabled}
          remainingToday={status.remainingToday}
          limit={status.limit}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
              <Link
                href={`/chat/${session.id}`}
                className="min-w-0 text-body-l font-semibold break-words no-underline hover:underline underline-offset-4"
              >
                {session.title ?? t("untitled")}
              </Link>
              <span className="text-body-s text-lava-muted">
                {[
                  session.itineraryId ? t("forTrip") : null,
                  t("updatedAt", { date: format.dateTime(new Date(session.updatedAt), { dateStyle: "medium", timeStyle: "short" }) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
