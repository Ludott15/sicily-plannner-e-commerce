import { useTranslations } from "next-intl";
import { pendingAttributes, type PendingId } from "@/lib/pending-actions";

// Testo non ancora scritto (Chi siamo, pagine legali, informative): un segnaposto visibile e
// neutro, mai testo inventato. Marcato data-pending come le azioni in sospeso, così il
// controllo di lancio (PRE_LAUNCH=1) fallisce finché il testo vero non lo sostituisce.
// inline: dentro una riga (didascalia, etichetta di una casella), senza riquadro.
export function PendingText({ id, inline = false }: { id: PendingId; inline?: boolean }) {
  const t = useTranslations("Design");
  if (inline) {
    return <span {...pendingAttributes(id)}>{t("pendingText")}</span>;
  }
  return (
    <p className="rounded-md border border-dashed border-border-control px-4 py-3 text-body text-lava-muted" {...pendingAttributes(id)}>
      {t("pendingText")}
    </p>
  );
}
