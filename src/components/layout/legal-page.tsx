import { getTranslations } from "next-intl/server";
import { PendingText } from "@/components/design";
import type { PendingId } from "@/lib/pending-actions";
import { TextPage } from "./text-page";

// Pagine legali (Privacy, Cookie, Condizioni di vendita): solo struttura. I testi legali li
// fornisce Ludovico; fino ad allora un segnaposto in sospeso che blocca il controllo di lancio.
export async function LegalPage({ titleKey, pendingId }: { titleKey: "privacy" | "cookie" | "terms"; pendingId: PendingId }) {
  const t = await getTranslations("Legal");
  return (
    <TextPage eyebrow={t("eyebrow")} title={t(titleKey)}>
      <PendingText id={pendingId} />
    </TextPage>
  );
}
