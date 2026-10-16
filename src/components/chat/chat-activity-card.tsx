import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { ChatActivityCard as ChatActivityCardData } from "@/lib/chat/events";
import { ButtonAnchor, ButtonLink } from "@/components/design";
import { formatDuration } from "@/lib/format";

// Scheda attività dentro la risposta dell'assistente: compatta, con il luogo, il prezzo da, la durata
// e la valutazione. "Vedi" va alla scheda attività; l'uscita verso il partner (goHref) si mostra solo
// con il nome del partner dichiarato, più la riga di trasparenza degli affiliati.
export function ChatActivityCard({ card }: { card: ChatActivityCardData }) {
  const t = useTranslations("Chat");
  const tAff = useTranslations("Affiliates");
  const format = useFormatter();

  const facts = [card.placeName, card.durationMinutes ? formatDuration(card.durationMinutes) : null].filter(Boolean);
  const price = card.priceFromCents !== null ? t("activity.priceFrom", { price: format.number(card.priceFromCents / 100, { style: "currency", currency: "EUR" }) }) : null;

  return (
    <article className="flex min-w-0 gap-3 rounded-lg border border-divider bg-calce-raised p-3">
      {card.coverUrl ? (
        <Image src={card.coverUrl} alt="" width={96} height={72} unoptimized className="h-[72px] w-24 shrink-0 rounded-md object-cover" />
      ) : (
        <span aria-hidden="true" className="h-[72px] w-24 shrink-0 rounded-md bg-calce-sunk" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="is-display text-body-l break-words text-lava">{card.title}</h3>
        {facts.length > 0 && <p className="text-body-s text-lava-muted">{facts.join(" · ")}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-s text-lava">
          {price && <span className="font-semibold">{price}</span>}
          {card.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <Star size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
              <span aria-label={t("activity.rating", { rating: format.number(card.rating, { maximumFractionDigits: 1 }) })}>
                {format.number(card.rating, { maximumFractionDigits: 1 })}
              </span>
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ButtonLink href={`/attivita/${card.slug}`} variant="secondary" size="sm">
            {t("activity.view")}
            <span className="sr-only"> {card.title}</span>
          </ButtonLink>
          {card.goHref && card.partnerName && (
            <ButtonAnchor href={card.goHref} variant="ghost" size="sm" rel="sponsored nofollow noopener">
              {t("activity.bookWith", { partner: card.partnerName })}
            </ButtonAnchor>
          )}
        </div>
        {card.goHref && card.partnerName && (
          <p className="text-caption text-lava-muted">{tAff("disclosure", { partner: card.partnerName })}</p>
        )}
      </div>
    </article>
  );
}
