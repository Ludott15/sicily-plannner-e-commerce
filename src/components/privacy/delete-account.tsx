"use client";

import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import {
  deleteAccount,
  deleteGuestData,
  sendDeleteAccountCode,
  type PrivacyActionResult,
  type PrivacyErrorCode,
} from "@/server/privacy/actions";

// Eliminazione dell'account in Account › Privacy (passo 8.2), a più passi, in un riquadro che si
// apre da un pulsante. Account con email: 1) CAPTCHA e invio del codice, 2) codice a 6 cifre e frase
// di conferma. Ospite (nessuna email): solo la frase di conferma. Esito positivo: la pagina di
// conferma (il server ha già chiuso la sessione).

export function DeleteAccount({ isGuest, phrase }: { isGuest: boolean; phrase: string }) {
  const t = useTranslations("Privacy");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<PrivacyErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const headingId = `${id}-heading`;
  const codeId = `${id}-code`;
  const confirmId = `${id}-confirm`;

  // Il token del CAPTCHA vale una sola volta: dopo ogni tentativo il widget si rimonta.
  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  }

  function close() {
    setOpen(false);
    setCodeSent(false);
    setCode("");
    setConfirmation("");
    setError(null);
    resetCaptcha();
  }

  function finish(result: PrivacyActionResult) {
    if (result.status === "error") {
      setError(result.code);
      return;
    }
    router.replace("/account-eliminato");
  }

  function sendCode() {
    if (!captchaToken) return;
    setError(null);
    startTransition(async () => {
      const result = await sendDeleteAccountCode({ captchaToken });
      resetCaptcha();
      if (result.status === "error") setError(result.code);
      else setCodeSent(true);
    });
  }

  function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isGuest
        ? await deleteGuestData({ locale, confirmation })
        : await deleteAccount({ locale, confirmation, code });
      finish(result);
    });
  }

  if (!open) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id={headingId} className="text-heading-3">
            {isGuest ? t("deleteGuestHeading") : t("deleteHeading")}
          </h2>
          <p className="text-body-s text-lava-muted">{isGuest ? t("deleteGuestIntro") : t("deleteIntro")}</p>
        </div>
        <div>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            {t("deleteOpen")}
          </Button>
        </div>
      </section>
    );
  }

  const errorNotice = error && (
    <p role="alert" className="text-body-s text-danger">
      {t(`errors.${error}`)}
    </p>
  );

  // Ospite: una sola schermata, con la frase di conferma.
  if (isGuest) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-6">
        <h2 id={headingId} className="text-heading-3">
          {t("deleteGuestHeading")}
        </h2>
        <p className="text-body text-pretty">{t("deleteGuestIntro")}</p>
        <form onSubmit={remove} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={confirmId} className="text-body font-semibold">
              {t("confirmLabel", { phrase })}
            </label>
            <input
              id={confirmId}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="min-h-11 w-full rounded-md border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava focus-visible:outline-2 focus-visible:outline-focus"
            />
          </div>
          {errorNotice}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={pending || confirmation.length === 0}>
              {t("deleteGuest")}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </section>
    );
  }

  // Account: passo 1, CAPTCHA e invio del codice.
  if (!codeSent) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-6">
        <h2 id={headingId} className="text-heading-3">
          {t("deleteHeading")}
        </h2>
        <p className="text-body text-pretty">{t("deleteIntro")}</p>
        <p className="text-body text-pretty">{t("deleteStays")}</p>
        <Turnstile key={captchaKey} locale={locale} onToken={setCaptchaToken} onError={() => setError("captcha_failed")} />
        {errorNotice}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={sendCode} disabled={pending || !captchaToken}>
            {t("sendCode")}
          </Button>
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      </section>
    );
  }

  // Account: passo 2, codice a 6 cifre e frase di conferma.
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <h2 id={headingId} className="text-heading-3">
        {t("deleteHeading")}
      </h2>
      <p role="status" className="text-body text-pretty">
        {t("codeSent")}
      </p>
      <form onSubmit={remove} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={codeId} className="text-body font-semibold">
            {t("codeLabel")}
          </label>
          <input
            id={codeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="min-h-11 w-full max-w-40 rounded-md border-[1.5px] border-border-control bg-calce-raised px-3 text-body tracking-widest text-lava focus-visible:outline-2 focus-visible:outline-focus"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={confirmId} className="text-body font-semibold">
            {t("confirmLabel", { phrase })}
          </label>
          <input
            id={confirmId}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="min-h-11 w-full rounded-md border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava focus-visible:outline-2 focus-visible:outline-focus"
          />
        </div>
        {errorNotice}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={pending || code.length !== 6 || confirmation.length === 0}>
            {t("deleteAccount")}
          </Button>
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </section>
  );
}
