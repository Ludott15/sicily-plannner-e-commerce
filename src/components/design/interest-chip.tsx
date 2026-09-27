"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Domain } from "./domains";

// InterestChip (docs/design/components/InterestChip/README.md)
// aria-pressed porta lo stato; selezionato: sfondo tenue, bordo colorato e spunta.
// Il colore non è mai l'unico segnale: la spunta indica la selezione.
// Etichette dalla tabella interests: brevi, al massimo tre parole.

export function InterestChip({
  label,
  domain,
  pressed,
  onPressedChange,
}: {
  label: string;
  domain?: Domain;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cn("is-chip", domain && `is-chip--${domain}`)}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
    >
      <Check className="is-chip__check" strokeWidth={2.5} aria-hidden="true" />
      {label}
    </button>
  );
}
