import type { ComponentProps } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// Button (docs/design/components/Button/README.md)
// - primary: una sola per vista, contando anche l'intestazione.
// - secondary: alternative, navigazione, offerte affiliate.
// - ghost: azioni leggere dentro il contenuto, in coccio-text.
// - sm: 36px disegnati, 44px di area toccabile.
// Etichette con verbo e oggetto ("Aggiungi al viaggio"). Mai "Prenota tutto".

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn("is-btn", `is-btn--${variant}`, size === "sm" && "is-btn--sm", className);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: Common & ComponentProps<"button">) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

// Link interno con lo stile di un bottone (percorsi localizzati).
export function ButtonLink({ variant, size, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// Link esterno o verso una route API (es. /api/go/[id]) con lo stile di un bottone.
export function ButtonAnchor({ variant, size, className, ...props }: Common & ComponentProps<"a">) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}
