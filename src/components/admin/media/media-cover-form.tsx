"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/design";
import type { CoverState } from "@/lib/media-admin";
import { Field, FormError, TextInput } from "../fields";

// "Usa come copertina di": lo slug di un luogo, un'attività o un itinerario pronto (per le
// illustrazioni, di un'area).
export function MediaCoverForm({
  mediaId,
  action,
}: {
  mediaId: string;
  action: (prev: CoverState, formData: FormData) => Promise<CoverState>;
}) {
  const t = useTranslations("Admin");
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="mediaId" value={mediaId} />
      <FormError message={state.status === "error" ? t(`mediaMatch.${state.error}`) : null} />
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t("mediaSetCover")} htmlFor="cover-slug" hint={t("mediaSetCoverHint")}>
          <TextInput id="cover-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="w-72" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("save")}
        </Button>
        {state.status === "saved" && (
          <span role="status" className="text-body-s text-lava-muted">
            {t("saved")}
          </span>
        )}
      </div>
    </form>
  );
}

export function DeleteMediaButton({ mediaId, action }: { mediaId: string; action: (formData: FormData) => Promise<{ ok: boolean }> }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("mediaDeleteConfirm"))) return;
        const data = new FormData();
        data.set("id", mediaId);
        start(async () => {
          const result = await action(data);
          if (result.ok) router.push("/admin/media");
        });
      }}
    >
      {t("mediaDelete")}
    </Button>
  );
}
