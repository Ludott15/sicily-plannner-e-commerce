import { useTranslations } from "next-intl";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { GuestStart } from "@/components/auth/guest-start";
import { Button } from "@/components/design";
import type { InAppBrowser } from "@/lib/in-app-browser";
import { signInWithGoogle } from "@/server/auth/actions";

// Pagina di accesso: codice via email (principale), Google, oppure continuare come ospite.
// Nei browser interni di Instagram, Facebook e TikTok Google blocca l'OAuth: il pulsante non
// c'è e al suo posto l'invito ad aprire la pagina nel browser.
export function LoginForm({
  locale,
  hasError,
  inAppBrowser,
}: {
  locale: string;
  hasError: boolean;
  inAppBrowser: InAppBrowser | null;
}) {
  const t = useTranslations("Login");

  return (
    <div className="flex flex-col gap-6">
      {hasError && (
        <p role="alert" className="text-body-s text-danger">
          {t("error")}
        </p>
      )}

      <EmailCodeForm mode="login" locale={locale} />

      <div className="flex items-center gap-3 text-body-s text-lava-muted">
        <span className="h-px flex-1 bg-divider" />
        {t("or")}
        <span className="h-px flex-1 bg-divider" />
      </div>

      {inAppBrowser ? (
        <p className="text-body-s text-lava-muted" data-in-app-browser={inAppBrowser}>
          {t("openInBrowser", { app: inAppBrowser })}
        </p>
      ) : (
        <form action={signInWithGoogle}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary" className="w-full">
            {t("google")}
          </Button>
        </form>
      )}

      <GuestStart locale={locale} />
    </div>
  );
}
