"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, DateField, Select } from "@/components/design";
import { clearAnnouncement, queueAnnouncement } from "@/lib/announce";
import { startTrip, type StartTripInput, type TripActionError } from "@/server/trips/actions";

// Date e persone, chiesti quando si salva un viaggio (M5): da un itinerario pronto o da una
// delle proposte. Chi non ha ancora una sessione la riceve da ospite (Turnstile). Il form sta
// dentro la carta del passo di salvataggio (viaggio/salva): qui solo i campi, l'errore e l'azione.
// onSubmit + startTransition (non <form action>): l'errore non fa perdere quello che si è scritto.
export function StartTripForm({
  locale,
  source,
  needsSession,
}: {
  locale: string;
  source: StartTripInput["source"];
  needsSession: boolean;
}) {
  const t = useTranslations("Trips");
  const startDateId = useId();
  const travelersId = useId();
  const [startDate, setStartDate] = useState("");
  const [travelers, setTravelers] = useState("2");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState<TripActionError["code"] | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Se l'azione riesce il server reindirizza al viaggio, che legge l'annuncio appena montato.
      queueAnnouncement(t("tripSavedAnnouncement"));
      const result = await startTrip({
        locale,
        source,
        startDate: startDate || null,
        travelers: travelers ? Number(travelers) : null,
        captchaToken: captchaToken ?? undefined,
      });
      if (result?.status === "error") {
        clearAnnouncement();
        setError(result.code);
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={startDateId} className="text-body-s font-semibold">
            {t("startDate")}
          </label>
          <DateField id={startDateId} name="startDate" value={startDate} onValueChange={setStartDate} />
          <span className="text-body-s font-normal text-lava-muted">{t("startDateHint")}</span>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={travelersId} className="text-body-s font-semibold">
            {t("travelers")}
          </label>
          <Select
            id={travelersId}
            name="travelers"
            label={t("travelers")}
            value={travelers}
            onValueChange={setTravelers}
            options={[
              { value: "", label: t("travelersUnknown") },
              ...Array.from({ length: 12 }, (_, i) => i + 1).map((n) => ({
                value: String(n),
                label: t("travelersOption", { count: n }),
              })),
            ]}
          />
        </div>
      </div>
      {needsSession && (
        <Turnstile key={captchaKey} locale={locale} onToken={setCaptchaToken} onError={() => setError("captcha_failed")} />
      )}
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          className="w-full sm:w-auto"
          disabled={pending || (needsSession && !captchaToken)}
          aria-busy={pending}
        >
          {t("create")}
        </Button>
      </div>
    </form>
  );
}
