import { brandMark } from "@generated/design/brand";
import { BRAND_NAME } from "@/lib/brand";

// Logo (docs/design/components/Logo/README.md). Il marchio è un SVG inline dalla geometria
// generata (docs/design/brand/logo/mark.json): i colori arrivano dai token come classi
// (fill-coccio), il monocromatico usa il colore del testo corrente.
// variant "full": marchio e nome in Fraunces, la dimensione segue il font-size del contenitore.
// variant "mark": solo il marchio, con l'etichetta accessibile.

export type LogoVariant = "full" | "mark";
export type LogoTone = "color" | "mono";

export function Logo({
  variant = "full",
  tone = "color",
  className = "",
}: {
  variant?: LogoVariant;
  tone?: LogoTone;
  className?: string;
}) {
  const mark =
    tone === "mono" ? (
      <svg viewBox={brandMark.viewBox} aria-hidden="true" focusable="false" className="h-[1.1em] w-[1.1em] shrink-0 fill-current">
        <path d={brandMark.mono} />
      </svg>
    ) : (
      <svg viewBox={brandMark.viewBox} aria-hidden="true" focusable="false" className="h-[1.1em] w-[1.1em] shrink-0">
        <path className="fill-coccio" d={brandMark.body} />
        <path className="fill-coccio" d={brandMark.sun} />
      </svg>
    );

  if (variant === "mark") {
    return (
      <span role="img" aria-label={BRAND_NAME} className={`inline-flex shrink-0 items-center ${className}`}>
        {mark}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-[0.3em] leading-none ${className}`}>
      {mark}
      <span className="is-display tracking-[-0.02em]">{BRAND_NAME}</span>
    </span>
  );
}
