"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { FormError, FormNotice } from "./fields";

// "Esegui ora" dell'import partner. L'azione server arriva come prop (*.admin.ts non si importa
// dai componenti, ESLint): la pagina passa runImportNow, che verifica l'admin e usa la stessa
// funzione del cron. Le forme qui sono ripetute perché il tipo vive in un file *.admin.ts.

export type ImportNowSummary = {
  partner: string;
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
  skippedCount: number;
  newActivities: number;
  tagsProposed: number;
};

export type ImportNowResult =
  | { success: true; data: ImportNowSummary; message?: string }
  | { success: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export type ImportNowAction = (input: { partner: string }) => Promise<ImportNowResult>;

export function ImportNowButton({ partner, action }: { partner: string; action: ImportNowAction }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportNowResult | null>(null);

  function onClick() {
    startTransition(async () => {
      setResult(null);
      let response: ImportNowResult;
      try {
        response = await action({ partner });
      } catch {
        response = { success: false, error: "" };
      }
      setResult(response);
      router.refresh();
    });
  }

  let errorMessage: string | null = null;
  if (result?.success === false) {
    errorMessage =
      result.code === "unconfigured"
        ? t("importNowErrors.unconfigured")
        : result.code === "invalid_input"
          ? t("importNowErrors.invalid_input")
          : t("importNowErrors.failed");
    if (result.code) errorMessage = `${errorMessage} ${t("importNowErrorCode", { code: result.code })}`;
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending} aria-busy={pending}>
        {pending ? t("importNowPending") : t("importNowRun")}
      </Button>
      <FormError message={errorMessage} />
      {result?.success === true && (
        <FormNotice
          message={t("importNowDone", {
            created: result.data.createdCount,
            updated: result.data.updatedCount,
            deactivated: result.data.deactivatedCount,
            skipped: result.data.skippedCount,
            newActivities: result.data.newActivities,
            tagsProposed: result.data.tagsProposed,
          })}
        />
      )}
    </div>
  );
}
