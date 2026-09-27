"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

// Bottone salva della ActivityCard: 44px, separato dal link della card.
export function SaveButton({
  saved,
  onSavedChange,
  title,
}: {
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  title: string;
}) {
  const t = useTranslations("Design");
  return (
    <button
      type="button"
      className="is-card__save"
      aria-pressed={saved}
      aria-label={`${t(saved ? "saved" : "save")}: ${title}`}
      onClick={() => onSavedChange(!saved)}
    >
      <Heart size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
