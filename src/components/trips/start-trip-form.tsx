"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/design";
import { startTrip, type StartTripInput, type TripActionError } from "@/server/trips/actions";

// Date e persone, chiesti quando si salva un viaggio (M5): da un itinerario pronto o da una
// delle proposte. Chi non ha ancora una sessione la riceve da ospite (Turnstile).
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
      const result = await startTrip({
        locale,
        source,
        startDate: startDate || null,
        travelers: travelers ? Number(travelers) : null,
        captchaToken: captchaToken ?? undefined,
      });
      if (result?.status === "error") {
        setError(result.code);
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-body-s font-semibold">
          {t("startDate")}
          <input
            type="date"
            name="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-11 rounded-md border border-divider bg-calce px-3 text-body font-normal"
          />
          <span className="font-normal text-lava-muted">{t("startDateHint")}</span>
        </label>
        <label className="flex flex-col gap-2 text-body-s font-semibold">
          {t("travelers")}
          <select
            name="travelers"
            value={travelers}
            onChange={(e) => setTravelers(e.target.value)}
            className="min-h-11 rounded-md border border-divider bg-calce px-3 text-body font-normal"
          >
            <option value="">{t("travelersUnknown")}</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {t("travelersOption", { count: n })}
              </option>
            ))}
          </select>
        </label>
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
        <Button type="submit" variant="primary" disabled={pending || (needsSession && !captchaToken)} aria-busy={pending}>
          {t("create")}
        </Button>
      </div>
    </form>
  );
}
