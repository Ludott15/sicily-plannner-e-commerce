import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "@/lib/i18n/navigation";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { getUser } from "@/server/auth";
import { safeNextPath } from "@/server/auth/redirect";
import { LoginForm } from "./login-form";

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
    <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            locale={locale}
            hasError={Boolean(error)}
            inAppBrowser={inAppBrowser}
            next={destination || undefined}
          />
        </CardContent>
      </Card>
    </section>
  );
}
