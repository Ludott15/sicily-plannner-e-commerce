"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/design";

// Errore inatteso in una pagina: cosa è successo, riprovare o tornare alla home.
// Il messaggio tecnico non si mostra; il digest serve a ritrovare l'errore nei log.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 md:px-8">
      <p className="text-label uppercase text-lava-muted">{t("errorEyebrow")}</p>
      <h1 className="is-display text-display-l">{t("errorTitle")}</h1>
      <p className="text-body-l text-pretty text-lava-muted">{t("errorText")}</p>
      {error.digest && <p className="text-caption text-lava-muted">{t("errorCode", { code: error.digest })}</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={reset}>
          {t("retry")}
        </Button>
        <ButtonLink href="/" variant="secondary">
          {t("toHome")}
        </ButtonLink>
      </div>
    </section>
  );
}
