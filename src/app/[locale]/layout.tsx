import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteHeader } from "@/components/layout/site-header";
import { fontVariables } from "@generated/design/fonts";
import { publicEnv } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import "../globals.css";
import "@/components/design/isula.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    openGraph: { siteName: t("title"), locale, type: "website" },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      {/* Su mobile la barra in basso (TabBar o BookingBar) copre 56px più l'area sicura: il footer resta sopra. */}
      <body className="flex min-h-full flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <NextIntlClientProvider>
          <SiteHeader />
          <main id="contenuto" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
          <MobileTabBar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
