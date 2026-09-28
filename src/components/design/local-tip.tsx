import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

// LocalTip (docs/design/components/LocalTip/README.md)
// Consiglio locale firmato, su superficie ink (scura in entrambi i temi).
// - Un solo fatto concreto, in una o due frasi.
// - Firma: "Redazione di Isula" con monogramma (rimanda a "Chi siamo"), oppure una
//   persona reale con nome, foto e relazione con il luogo. Senza relazione vera si firma
//   come redazione. Mai autori inventati: i dati arrivano da public_local_tips.
// - Data di verifica sempre visibile e reale.
// - Al massimo uno per vista su mobile (regola della pagina).

export type LocalTipAuthor =
  | { kind: "editorial"; aboutHref?: string }
  | { kind: "person"; name: string; relation: string; photoUrl?: string | null };

export function LocalTip({
  text,
  author,
  verifiedAt,
  place,
}: {
  text: string;
  author: LocalTipAuthor;
  // Data di verifica già formattata come "mese anno" ("giugno 2026").
  verifiedAt: string;
  place?: string;
}) {
  const t = useTranslations("Design");
  const editorialName = t("editorial");

  return (
    <aside className="is-localtip" aria-label={t("localTipAria")}>
      <span className="is-localtip__label">{place ? t("localTipLabelPlace", { place }) : t("localTipLabel")}</span>
      <p className="is-localtip__text">{text}</p>
      <div className="is-byline">
        <span className="is-byline__photo" aria-hidden="true">
          {author.kind === "editorial" ? (
            t("editorialMonogram")
          ) : author.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.photoUrl} alt="" />
          ) : null}
        </span>
        <div>
          <div className="is-byline__name">
            {author.kind === "editorial" ? (
              author.aboutHref ? (
                <Link href={author.aboutHref}>{editorialName}</Link>
              ) : (
                editorialName
              )
            ) : (
              author.name
            )}
          </div>
          <div className="is-byline__role">
            {author.kind === "person"
              ? t("relationVerifiedAt", { relation: author.relation, date: verifiedAt })
              : t("verifiedAt", { date: verifiedAt })}
          </div>
        </div>
      </div>
    </aside>
  );
}
