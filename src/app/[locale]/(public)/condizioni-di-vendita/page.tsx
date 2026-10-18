import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { isPending } from "@/lib/pending-actions";
import { canonicalFor } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("terms"), alternates: canonicalFor(locale, "/condizioni-di-vendita"), robots: { index: !isPending("legal.terms") } };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage titleKey="terms" pendingId="legal.terms" />;
}
