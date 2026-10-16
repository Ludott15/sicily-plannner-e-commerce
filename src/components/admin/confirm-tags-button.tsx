"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { FormError, FormNotice } from "./fields";

// "Conferma tag" della coda Da verificare: le proposte dell'import diventano tag dell'attività.
// L'azione server arriva come prop (*.admin.ts non si importa dai componenti, ESLint).

export type ConfirmTagsResult =
  | { success: true; data: { activityId: string; tags: number }; message?: string }
  | { success: false; error: string; code?: string };

export type ConfirmTagsAction = (activityId: string) => Promise<ConfirmTagsResult>;

export function ConfirmTagsButton({ activityId, action }: { activityId: string; action: ConfirmTagsAction }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ConfirmTagsResult | null>(null);

  function onClick() {
    startTransition(async () => {
      setResult(null);
      let response: ConfirmTagsResult;
      try {
        response = await action(activityId);
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
      result.code === "no_proposals"
        ? t("tagsErrors.no_proposals")
        : result.code === "invalid_input"
          ? t("tagsErrors.invalid_input")
          : t("tagsErrors.failed");
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onClick} disabled={pending} aria-busy={pending}>
        {pending ? t("confirmTagsPending") : t("confirmTags")}
      </Button>
      <FormError message={errorMessage} />
      {result?.success === true && <FormNotice message={t("confirmTagsDone", { tags: result.data.tags })} />}
    </div>
  );
}
