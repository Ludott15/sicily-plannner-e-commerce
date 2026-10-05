"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { startGuestSession, type AuthErrorCode } from "@/server/auth/actions";
import { Turnstile } from "./turnstile";

// "Continua senza account": sessione ospite (anonima) protetta da Turnstile. Dopo, l'ospite
// crea e salva i suoi itinerari; l'account lo crea quando vuole, con la sua email.
export function GuestStart({ locale, next }: { locale: string; next?: string }) {
  const t = useTranslations("Login");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startGuestSession({ locale, captchaToken: captchaToken ?? "", next });
      // In caso di successo l'azione reindirizza.
      if (result?.status === "error") {
        setError(result.code);
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-s text-lava-muted">{t("guestText")}</p>
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      <Turnstile
        key={captchaKey}
        locale={locale}
        onToken={setCaptchaToken}
        onError={() => setError("captcha_failed")}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={start}
        disabled={pending || !captchaToken}
        aria-busy={!captchaToken}
      >
        {t("guestStart")}
      </Button>
    </div>
  );
}
