"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, type ButtonVariant } from "@/components/design";

// Condividi: il pannello di condivisione del sistema dove esiste (mobile, browser interni
// delle app), altrimenti copia il link negli appunti.
// iconOnly: solo l'icona con l'etichetta accessibile (barra fissa dell'itinerario su mobile).
export function ShareButton({
  title,
  variant = "secondary",
  iconOnly = false,
}: {
  title: string;
  variant?: ButtonVariant;
  iconOnly?: boolean;
}) {
  const t = useTranslations("Catalog");
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Condivisione annullata: nessun messaggio.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant={variant}
      onClick={share}
      aria-live="polite"
      aria-label={iconOnly ? (copied ? t("linkCopied") : t("share")) : undefined}
      className={iconOnly ? "aspect-square px-0" : undefined}
    >
      <Share2 size={20} strokeWidth={1.5} aria-hidden="true" />
      {!iconOnly && (copied ? t("linkCopied") : t("share"))}
    </Button>
  );
}
