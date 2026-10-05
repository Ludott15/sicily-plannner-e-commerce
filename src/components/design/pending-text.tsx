import { useTranslations } from "next-intl";
import { pendingAttributes, SHOW_PENDING_HINT, type PendingId } from "@/lib/pending-actions";

// Testo non ancora scritto (Chi siamo, pagine legali): un segnaposto visibile e neutro, mai
// testo inventato. Marcato data-pending come le azioni in sospeso, così il controllo di
// lancio (PRE_LAUNCH=1) fallisce finché il testo vero non sostituisce il segnaposto.
export function PendingText({ id }: { id: PendingId }) {
  const t = useTranslations("Design");
  return (
    <p className="rounded-md border border-dashed border-border-control px-4 py-3 text-body text-lava-muted" {...pendingAttributes(id)}>
      {t("pendingText")}
      {SHOW_PENDING_HINT && <span className="block text-caption">{id}</span>}
    </p>
  );
}
