import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth";
import { listNotifications } from "@/server/notifications/queries";

// Notifiche (4.2): le risposte alle proposte fatte nei gruppi. Il conteggio non letto è nella
// intestazione; aprire la pagina le segna come lette (NotificationsList).
type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NotificationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, items] = await Promise.all([getTranslations("Notifications"), listNotifications(user)]);

  return (
    <PageContainer>
      <PageHeader title={t("title")} />
      <NotificationsList items={items} />
    </PageContainer>
  );
}
