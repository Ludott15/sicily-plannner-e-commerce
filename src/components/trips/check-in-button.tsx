"use client";

import { startTransition, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { checkInAction } from "@/server/gamification/actions";
import type { CheckInResult } from "@/server/gamification/types";
import { CHECK_IN_RADIUS_M } from "@/server/gamification/config";
import { ConfirmDialog } from "./confirm-dialog";

// "Sono qui" sulla tappa (passo 5.1). La posizione si chiede solo dopo il consenso esplicito
// nella finestra; le coordinate vanno all'azione server e non si salvano né si registrano.
// Il server decide l'esito (distanza, limite giornaliero, già fatto): qui si mostra solo.

type GeoCode = "geoUnsupported" | "geoDenied" | "geoUnavailable";

type Outcome = { kind: "none" } | { kind: "result"; result: CheckInResult } | { kind: "geo"; code: GeoCode };

export function CheckInButton({ itemId, checkedInToday }: { itemId: string; checkedInToday: boolean }) {
  const t = useTranslations("CheckIn");
  const router = useRouter();
  const [consentOpen, setConsentOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(checkedInToday);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

  // Quando il server conferma il check-in, il conteggio dei punti della pagina si aggiorna.
  useEffect(() => {
    if (outcome.kind === "result" && outcome.result.status === "ok") router.refresh();
  }, [outcome, router]);

  function submit(lat: number, lng: number) {
    startTransition(async () => {
      setSaving(true);
      const result = await checkInAction({ itemId, lat, lng });
      setSaving(false);
      if (result.status === "ok" || (result.status === "error" && result.code === "already_checked_in")) setDone(true);
      setOutcome({ kind: "result", result });
    });
  }

  function verify() {
    setConsentOpen(false);
    setOutcome({ kind: "none" });
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setOutcome({ kind: "geo", code: "geoUnsupported" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        submit(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(false);
        setOutcome({ kind: "geo", code: error.code === error.PERMISSION_DENIED ? "geoDenied" : "geoUnavailable" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const busy = locating || saving;

  const message =
    outcome.kind === "geo" ? (
      <p role="alert" className="text-body-s text-danger">
        {t(outcome.code)}
      </p>
    ) : outcome.kind === "result" && outcome.result.status === "ok" ? (
      <p role="status" className="text-body-s text-lava">
        {t("okPoints", { points: outcome.result.points })}
        {outcome.result.itineraryCompleted && <span className="block">{t("okItinerary")}</span>}
      </p>
    ) : outcome.kind === "result" && outcome.result.status === "error" ? (
      <p role="alert" className="text-body-s text-danger">
        {t(`errors.${outcome.result.code}`)}
      </p>
    ) : null;

  return (
    <div className="flex flex-col items-start gap-2">
      {done ? (
        <p className="is-tag">{t("doneToday")}</p>
      ) : (
        <Button variant="secondary" size="sm" disabled={busy} aria-busy={busy} onClick={() => setConsentOpen(true)}>
          {busy ? t("checking") : t("button")}
        </Button>
      )}
      {message}
      <ConfirmDialog open={consentOpen} title={t("consentTitle")} onClose={() => setConsentOpen(false)}>
        <p className="text-body text-lava-muted">{t("consentText", { meters: CHECK_IN_RADIUS_M })}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setConsentOpen(false)}>
            {t("consentCancel")}
          </Button>
          <Button variant="primary" onClick={verify}>
            {t("consentConfirm")}
          </Button>
        </div>
      </ConfirmDialog>
    </div>
  );
}
