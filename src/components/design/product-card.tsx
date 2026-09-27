import type { ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// ProductCard (docs/design/components/ProductCard/README.md)
// - Produttore sempre visibile, in maiuscolo pistacchio.
// - Prezzo IVA inclusa, in Fraunces. Spedizione nel carrello, non nella card.
// - Aggiunta al carrello con bottone secondario (action).
// - Variante orizzontale (row) per le pagine di luogo e attività, al massimo tre.

export function ProductCard({
  href,
  title,
  maker,
  price,
  imageUrl,
  placeholder,
  row = false,
  action,
}: {
  href: string;
  title: string;
  // "Produttore · Località"
  maker: string;
  // Prezzo già formattato, IVA inclusa.
  price: string;
  imageUrl?: string | null;
  // Testo del segnaposto senza foto (es. il nome della box).
  placeholder: string;
  row?: boolean;
  action?: ReactNode;
}) {
  return (
    <article className={cn("is-product", row && "is-product--row")}>
      <div className="is-product__media">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">{placeholder}</span>
        )}
      </div>
      <div className="is-product__body">
        <p className="is-product__maker">{maker}</p>
        <h3 className="is-product__title">
          <Link href={href}>{title}</Link>
        </h3>
        <div className="is-product__foot">
          <span className="is-product__price">{price}</span>
          {action}
        </div>
      </div>
    </article>
  );
}
