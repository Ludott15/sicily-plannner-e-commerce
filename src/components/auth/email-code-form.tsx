"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendEmailCode,
  sendGuestEmailCode,
  verifyEmailCode,
  verifyGuestEmailCode,
  type AuthErrorCode,
} from "@/server/auth/actions";
import { Turnstile } from "./turnstile";

// Accesso con codice a 6 cifre, nella stessa pagina (schemi.md, "Arrivi dai social"):
// 1) email → il codice arriva per email (con il link come alternativa);
// 2) codice → accesso, senza lasciare la pagina.
// mode "login": accesso o nuovo account, con Turnstile sull'invio.
// mode "guest": l'ospite aggiunge la sua email e diventa un account, stesso user id.
// Le azioni partono da onSubmit con startTransition: i campi restano dopo un errore.
export function EmailCodeForm({ mode, locale }: { mode: "login" | "guest"; locale: string }) {
  const t = useTranslations("Login");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [notice, setNotice] = useState<"resent" | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Il token Turnstile vale una volta: dopo ogni invio il widget si rimonta.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const needsCaptcha = mode === "login";

  function send(resend: boolean) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result =
        mode === "login"
          ? await sendEmailCode({ email, locale, captchaToken: captchaToken ?? "" })
          : await sendGuestEmailCode({ email });
      if (needsCaptcha) {
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
      if (result.status === "error") {
        setError(result.code);
        return;
      }
      setStep("code");
      setCode("");
      if (resend) setNotice("resent");
    });
  }

  function onSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(false);
  }

  function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result =
        mode === "login"
          ? await verifyEmailCode({ email, code, locale })
          : await verifyGuestEmailCode({ email, code, locale });
      // In caso di successo l'azione reindirizza al profilo.
      if (result?.status === "error") setError(result.code);
    });
  }

  const errorMessage = error && (
    <p role="alert" className="text-body-s text-danger">
      {t(`errors.${error}`)}
    </p>
  );

  const captcha = needsCaptcha && (
    <Turnstile
      key={captchaKey}
      locale={locale}
      onToken={setCaptchaToken}
      onError={() => setError("captcha_failed")}
    />
  );

  if (step === "code") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-body">
          {t(mode === "login" ? "codeSent" : "guestCodeSent", { email })}
        </p>
        <form onSubmit={onSubmitCode} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${mode}-code`}>{t("code")}</Label>
            <Input
              id={`${mode}-code`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              aria-invalid={error === "invalid_code" || error === "code_expired"}
              className="text-heading-2 tracking-[0.3em] tabular-nums"
            />
          </div>
          {errorMessage}
          {notice === "resent" && (
            <p role="status" className="text-body-s text-lava-muted">
              {t("codeResent")}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={pending || code.length !== 6}>
            {t(mode === "login" ? "verify" : "guestVerify")}
          </Button>
        </form>
        {mode === "login" && <p className="text-body-s text-lava-muted">{t("linkAlternative")}</p>}
        {captcha}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <button
            type="button"
            className="text-body-s underline underline-offset-4"
            disabled={pending || (needsCaptcha && !captchaToken)}
            onClick={() => send(true)}
          >
            {t("resend")}
          </button>
          <button
            type="button"
            className="text-body-s underline underline-offset-4"
            onClick={() => {
              setStep("email");
              setError(null);
              setNotice(null);
            }}
          >
            {t("changeEmail")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmitEmail} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${mode}-email`}>{t("email")}</Label>
        <Input
          id={`${mode}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error === "invalid_email" || error === "email_taken"}
        />
      </div>
      {errorMessage}
      {captcha}
      <Button
        type="submit"
        variant="primary"
        disabled={pending || (needsCaptcha && !captchaToken)}
        aria-busy={needsCaptcha && !captchaToken}
      >
        {t(mode === "login" ? "sendCode" : "guestSendCode")}
      </Button>
    </form>
  );
}
