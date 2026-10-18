"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { CONTACT_MESSAGE_MAX_LENGTH, CONTACT_MESSAGE_MIN_LENGTH, CONTACT_TOPICS, type ContactTopic } from "@/lib/contact";
import { sendContactMessage, type ContactResult } from "@/server/contact/actions";

// Modulo di contatto (passo 8.3). Nessun dato viene salvato nel database: il messaggio arriva
// per email all'indirizzo di assistenza. L'invio parte da onSubmit con startTransition, così i
// campi restano scritti dopo un errore. Il token Turnstile vale una volta: dopo ogni invio il
// widget si rimonta.

const TOPICS: readonly ContactTopic[] = CONTACT_TOPICS;
const MAX_MESSAGE_CHARS = CONTACT_MESSAGE_MAX_LENGTH;
const MIN_MESSAGE_CHARS = CONTACT_MESSAGE_MIN_LENGTH;

type ContactErrorCode = Extract<ContactResult, { status: "error" }>["code"];

const FIELD =
  "w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 py-2 text-body text-lava placeholder:text-lava-muted";

export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations("Contact");
  const ids = {
    name: useId(),
    email: useId(),
    topic: useId(),
    message: useId(),
    hint: useId(),
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("trip");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ContactErrorCode | null>(null);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !captchaToken) return;
    const token = captchaToken;
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendContactMessage({
        name: name.trim() || undefined,
        email: email.trim(),
        topic,
        message: message.trim(),
        captchaToken: token,
      });
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      if (result.status === "error") {
        setError(result.code);
        return;
      }
      setSent(true);
      setMessage("");
    });
  }

  const length = message.trim().length;
  const invalid = error === "invalid";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.name} className="text-body-s font-semibold">
          {t("nameLabel")}
        </label>
        <input
          id={ids.name}
          name="name"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`min-h-11 ${FIELD}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="text-body-s font-semibold">
          {t("emailLabel")}
        </label>
        <input
          id={ids.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={invalid}
          className={`min-h-11 ${FIELD}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.topic} className="text-body-s font-semibold">
          {t("topicLabel")}
        </label>
        <select
          id={ids.topic}
          name="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value as ContactTopic)}
          className={`min-h-11 ${FIELD}`}
        >
          {TOPICS.map((value) => (
            <option key={value} value={value}>
              {t(`topics.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.message} className="text-body-s font-semibold">
          {t("messageLabel")}
        </label>
        <textarea
          id={ids.message}
          name="message"
          required
          maxLength={MAX_MESSAGE_CHARS}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={ids.hint}
          className={`min-h-40 ${FIELD}`}
        />
        <p id={ids.hint} className="text-caption text-lava-muted">
          {t("messageHint", { count: length })}
        </p>
      </div>

      <p className="text-body-s text-lava-muted">
        {t.rich("privacyNote", {
          privacy: (chunks) => (
            <Link href="/privacy" className="font-semibold text-coccio-text underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <Turnstile key={captchaKey} locale={locale} onToken={setCaptchaToken} onError={() => setError("captcha_failed")} />

      <div aria-live="polite" className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
            <span className="font-semibold text-danger">{t(`errors.${error}`)}</span>
          </p>
        )}
        {sent && (
          <p role="status" className="rounded-sm border-[1.5px] border-border-control bg-calce-raised px-4 py-3 text-body">
            {t("sent")}
          </p>
        )}
      </div>

      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !captchaToken || email.trim().length === 0 || length < MIN_MESSAGE_CHARS}
          aria-busy={pending}
        >
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
