import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { redirect } from "@/lib/i18n/navigation";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { getUser } from "@/server/auth";
import { safeNextPath } from "@/server/auth/redirect";
import { LoginForm } from "./login-form";

// Accesso: nessuna card. Titolo e spiegazione in testa, poi il modulo su una colonna stretta,
// centrato in verticale nella pagina.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Anche un ospite va al profilo: lì salva il suo account con l'email.
  if (await getUser()) redirect({ href: "/profilo", locale });

  const [{ error, next }, t, requestHeaders] = await Promise.all([searchParams, getTranslations("Login"), headers()]);
  const inAppBrowser = detectInAppBrowser(requestHeaders.get("user-agent"));
  // Destinazione dopo l'accesso (per esempio un invito): solo percorsi interni.
  const destination = safeNextPath(next, "");

  return (
    <PageContainer width="prose" className="flex-1 justify-center py-16">
      <header className="flex flex-col gap-3">
        <h1 className="is-display text-display-l">{t("title")}</h1>
        <p className="text-body-l text-pretty text-lava-muted">{t("description")}</p>
      </header>
      <div className="max-w-sm">
        <LoginForm
          locale={locale}
          hasError={Boolean(error)}
          inAppBrowser={inAppBrowser}
          next={destination || undefined}
        />
      </div>
    </PageContainer>
  );
}
