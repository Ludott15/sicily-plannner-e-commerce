import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { SiteHeader } from "@/components/layout/site-header";
import { fontVariables } from "@generated/design/fonts";
import { publicEnv } from "@/lib/env";
import { ANONYMOUS_SESSION } from "@/lib/pwa";
import { getUser } from "@/server/auth";
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
  // Identificatore opaco della sessione per il service worker (passo 11.3): hash SHA-256 dell'id, mai l'id.
  const user = await getUser();
  const sessionId = user ? createHash("sha256").update(user.id).digest("hex") : ANONYMOUS_SESSION;

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`}>
      {/* Su mobile la barra in basso copre il fondo della pagina: la TabBar 56px più l'area sicura,
          la barra delle azioni (ActionBar) l'altezza che misura in --bottom-bar-h. Il footer resta sopra. */}
      <body className="flex min-h-full flex-col pb-[var(--bottom-bar-h,calc(56px+env(safe-area-inset-bottom)))] md:pb-0">
        <NextIntlClientProvider>
          <OfflineBanner />
          <SiteHeader />
          <main id="contenuto" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
          <CookieBanner initial={parseConsent((await cookies()).get(CONSENT_COOKIE)?.value)} />
          <MobileTabBar />
          <ServiceWorkerRegistration sessionId={sessionId} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
