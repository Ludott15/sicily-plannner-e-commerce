"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";

// Errore inatteso in una pagina: cosa è successo, riprovare o tornare alla home.
// Il messaggio tecnico non si mostra; il digest serve a ritrovare l'errore nei log.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer width="prose" className="flex-1 justify-center py-16 gap-4">
      <p className="text-label uppercase text-lava-muted">{t("errorEyebrow")}</p>
      <h1 className="is-display text-display-l">{t("errorTitle")}</h1>
      <p className="text-body-l text-pretty text-lava-muted">{t("errorText")}</p>
      {error.digest && <p className="text-caption text-lava-muted">{t("errorCode", { code: error.digest })}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={reset}>
          {t("retry")}
        </Button>
        <ButtonLink href="/" variant="secondary">
          {t("toHome")}
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
