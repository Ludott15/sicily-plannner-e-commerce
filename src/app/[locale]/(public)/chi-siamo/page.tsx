import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PendingText } from "@/components/design";
import { TextPage, TextSection } from "@/components/layout/text-page";
import { isPending } from "@/lib/pending-actions";
import { canonicalFor } from "@/lib/seo";

// Chi siamo: la redazione che firma i consigli e il fondatore. I testi li scrive Ludovico:
// fino ad allora segnaposto in sospeso (bloccano il controllo di lancio).
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("title"), alternates: canonicalFor(locale, "/chi-siamo"), robots: { index: !isPending("about.editorial", "about.founder") } };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");

  return (
    <TextPage title={t("title")}>
      <TextSection id="redazione" title={t("editorialTitle")}>
        <PendingText id="about.editorial" />
      </TextSection>
      <TextSection id="fondatore" title={t("founderTitle")}>
        <PendingText id="about.founder" />
      </TextSection>
    </TextPage>
  );
}
