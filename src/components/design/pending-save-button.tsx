import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { pendingAttributes, SHOW_PENDING_HINT } from "@/lib/pending-actions";

// Bottone salva della ActivityCard finché il salvataggio non esiste (milestone 5).
export function PendingSaveButton({ title }: { title: string }) {
  const t = useTranslations("Design");
  return (
    <button
      type="button"
      className="is-card__save"
      aria-label={`${t("save")}: ${title}`}
      title={SHOW_PENDING_HINT ? t("pendingHint") : undefined}
      {...pendingAttributes("card.save")}
    >
      <Heart size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
