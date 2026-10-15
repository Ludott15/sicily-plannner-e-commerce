"use client";

import { startTransition, useActionState, useEffect, useId, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Checkbox, Field, FormError, FormNotice, TextInput } from "@/components/admin/fields";
import { buttonClass } from "@/components/design";
import { setLeaderboardOptOut, setPublicName } from "@/server/gamification/leaderboard-actions";
import type { SettingsFormState } from "@/lib/leaderboard-form";

// Impostazioni della classifica nel profilo (passo 5.3): opt-out dalla classifica stagionale e nome
// pubblico, con l'anteprima di come si compare. Ogni form parte da onSubmit con startTransition (come
// use-admin-form), così un errore non cancella quello che l'utente ha scritto. Dopo un salvataggio
// riuscito la pagina si rigenera, così l'anteprima mostra il valore salvato.

type Props = { optOut: boolean; displayName: string | null; publicName: string };

function useSettingsForm<Input>(action: (prev: SettingsFormState, input: Input) => Promise<SettingsFormState>) {
  const [state, dispatch, pending] = useActionState<SettingsFormState, Input>(action, { status: "idle" });
  const router = useRouter();

  useEffect(() => {
    if (state.status === "saved") router.refresh();
  }, [state, router]);

  function submit(input: Input) {
    startTransition(() => dispatch(input));
  }

  return { state, pending, submit };
}

export function LeaderboardSettings({ optOut, displayName, publicName }: Props) {
  const t = useTranslations("LeaderboardSettings");
  const optOutForm = useSettingsForm(setLeaderboardOptOut);
  const nameForm = useSettingsForm(setPublicName);
  const nameId = useId();

  function errorFor(state: SettingsFormState): string | null {
    if (state.status !== "error") return null;
    if (state.code === "guest_not_allowed") return t("errorGuest");
    if (state.code === "invalid") return t("errorInvalid");
    return t("errorFailed");
  }

  function onOptOutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    optOutForm.submit({ optOut: new FormData(event.currentTarget).get("optOut") === "on" });
  }

  function onNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("displayName");
    nameForm.submit({ displayName: typeof value === "string" ? value : "" });
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onOptOutSubmit} className="flex flex-col gap-3">
        <FormError message={errorFor(optOutForm.state)} />
        <FormNotice message={optOutForm.state.status === "saved" ? t("saved") : null} />
        <Checkbox name="optOut" defaultChecked={optOut} label={t("optOutLabel")} />
        <p className="text-caption text-lava-muted">{t("optOutHint")}</p>
        <div>
          <button type="submit" className={buttonClass("primary")} disabled={optOutForm.pending}>
            {optOutForm.pending ? t("saving") : t("saveOptOut")}
          </button>
        </div>
      </form>

      <form onSubmit={onNameSubmit} className="flex flex-col gap-3">
        <FormError message={errorFor(nameForm.state)} />
        <FormNotice message={nameForm.state.status === "saved" ? t("saved") : null} />
        <Field label={t("publicNameLabel")} htmlFor={nameId} hint={t("publicNameHint")}>
          <TextInput id={nameId} name="displayName" defaultValue={displayName ?? ""} maxLength={40} autoComplete="nickname" />
        </Field>
        <p className="text-body-s text-lava-muted">
          {t("previewLabel")} <span className="font-semibold text-lava">{publicName}</span>
        </p>
        <div>
          <button type="submit" className={buttonClass("secondary")} disabled={nameForm.pending}>
            {nameForm.pending ? t("saving") : t("savePublicName")}
          </button>
        </div>
      </form>
    </div>
  );
}
