import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { pendingAttributes, SHOW_PENDING_HINT, type PendingId } from "@/lib/pending-actions";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

// Azione del mockup non ancora attiva (src/lib/pending-actions.ts): stesso aspetto e
// stessa posizione del bottone vero, ma aria-disabled e senza effetto. In sviluppo
// sotto il bottone compare "Disponibile a breve".
export function PendingButton({
  id,
  variant,
  size,
  className,
  fullWidth = false,
  children,
}: {
  id: PendingId;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Design");
  const button = (
    <button
      type="button"
      className={buttonClass(variant, size, [fullWidth && "w-full", className].filter(Boolean).join(" "))}
      {...pendingAttributes(id)}
    >
      {children}
    </button>
  );
  if (!SHOW_PENDING_HINT) return button;
  return (
    <span className={fullWidth ? "flex w-full flex-col gap-1" : "inline-flex flex-col items-start gap-1"}>
      {button}
      <span className="text-caption text-lava-muted">{t("pendingHint")}</span>
    </span>
  );
}
