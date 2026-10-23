import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TextPage } from "@/components/layout/text-page";
import { canonicalFor } from "@/lib/seo";
import { listPhotoCredits } from "@/server/catalog/queries";

// Crediti delle foto: tutti i media pubblici (la RLS di media fa vedere solo quelli usabili
// e copertina di un'entità pubblicata), con autore, licenza e fonte, ognuno con il suo link.
// Le illustrazioni sono raccolte in una riga sola.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Credits" });
  return { title: t("title"), description: t("intro"), alternates: canonicalFor(locale, "/crediti-foto") };
}

export default async function PhotoCreditsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tMedia, credits] = await Promise.all([getTranslations("Credits"), getTranslations("Media"), listPhotoCredits()]);
  const photos = credits.filter((c) => c.kind === "photo");
  const illustrations = credits.filter((c) => c.kind === "illustration");
  const link = (text: string, href: string | null) =>
    href ? (
      <a href={href} rel="nofollow noopener noreferrer" target="_blank">
        {text}
      </a>
    ) : (
      text
    );

  return (
    <TextPage title={t("title")} intro={t("intro")}>
      {photos.length === 0 ? (
        <p className="text-body-l text-lava-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider" data-testid="photo-credits">
          {photos.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-4 text-body">
              <span className="font-semibold">{c.usedBy.join(", ")}</span>
              <span className="text-lava-muted">
                {(locale === "en" ? c.altEn || c.altIt : c.altIt) ?? ""}
              </span>
              <span>
                {t("author")}: {link(c.author ?? "", c.authorUrl)} · {t("license")}: {link(c.license ?? "", c.licenseUrl)}
                {c.sourceLink && <> · {link(t("source"), c.sourceLink)}</>}
                {c.modified && <> · {tMedia("modified")}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {illustrations.length > 0 && <p className="text-body">{t("illustrations", { count: illustrations.length })}</p>}
    </TextPage>
  );
}
