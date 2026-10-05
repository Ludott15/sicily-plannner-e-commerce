import { LocalTip } from "@/components/design";
import type { PublicTip } from "@/server/catalog/tips";

// Un consiglio di public_local_tips come LocalTip: firma della redazione o della persona
// (con relazione e foto), data di verifica come "mese anno", luogo nell'etichetta se richiesto.
export function CatalogLocalTip({ tip, locale, showPlace = false }: { tip: PublicTip; locale: string; showPlace?: boolean }) {
  const verifiedAt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${tip.verifiedAt}T00:00:00Z`),
  );
  return (
    <LocalTip
      text={tip.body}
      verifiedAt={verifiedAt}
      place={showPlace ? (tip.placeName ?? undefined) : undefined}
      author={
        tip.authorKind === "person"
          ? { kind: "person", name: tip.authorName, relation: tip.authorRelation ?? "", photoUrl: tip.authorPhotoUrl }
          : { kind: "editorial" }
      }
    />
  );
}
