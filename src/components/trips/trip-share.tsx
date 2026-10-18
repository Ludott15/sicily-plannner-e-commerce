"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { createShareLink, revokeShareLink, type ShareLinkState, type TripFormState } from "@/server/trips/actions";
import { FieldLabel, FormAlert, controlClass } from "./trip-ui";
import { useTripForm } from "./use-trip-form";

// Link pubblico in sola lettura, dentro il dialog "Link pubblico" del menu del viaggio (TripActions).
// Il token in chiaro arriva una sola volta, dall'azione di creazione: lo si mostra con "Copia" e
// "Condividi" (Web Share dove c'è, altrimenti copia). "Rigenera" crea un link nuovo e il server revoca
// il precedente; "Revoca" spegne quello attivo. Dopo la revoca il pannello si rimonta (key sul padre).

const IDLE_LINK: ShareLinkState = { status: "error", code: "invalid" };
const IDLE: TripFormState = { status: "ok" };

export function TripShare({
  tripId,
  locale,
  title,
  activeSince,
  onRevoked,
}: {
  tripId: string;
  locale: string;
  title: string;
  activeSince: string | null;
  onRevoked: () => void;
}) {
  const t = useTranslations("Trips");
  const id = useId();
  const [copied, setCopied] = useState(false);
  const create = useTripForm<ShareLinkState>(createShareLink, IDLE_LINK);
  const revoke = useTripForm<TripFormState>(async (_prev, formData) => {
    const result = await revokeShareLink(formData);
    if (result.status === "ok") onRevoked();
    return result;
  }, IDLE);

  const url = create.state.status === "created" ? create.state.url : null;
  const hasLink = url !== null || activeSince !== null;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share(link: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: link });
      } catch {
        // Condivisione annullata: nessun messaggio.
      }
      return;
    }
    await copy(link);
  }

  const createError = create.submitted && create.state.status === "error" ? t(`errors.${create.state.code}`) : null;
  const revokeError = revoke.submitted && revoke.state.status === "error" ? t(`errors.${revoke.state.code}`) : null;

  return (
    <div aria-busy={create.pending || revoke.pending} className="flex flex-col gap-4">
      {url ? (
        <div className="flex flex-col gap-3">
          <FieldLabel htmlFor={`${id}-url`}>{t("shareUrlLabel")}</FieldLabel>
          <input id={`${id}-url`} readOnly value={url} onFocus={(event) => event.currentTarget.select()} className={controlClass} />
          <p className="text-body-s text-lava-muted">{t("shareOnce")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(url)}>
              {copied ? t("shareCopied") : t("shareCopy")}
            </Button>
            <Button variant="secondary" onClick={() => share(url)}>
              {t("shareNative")}
            </Button>
          </div>
        </div>
      ) : activeSince ? (
        <p className="text-body text-lava-muted">{t("shareActiveSince", { date: activeSince })}</p>
      ) : (
        <p className="text-body text-lava-muted">{t("shareNone")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <form onSubmit={create.submit}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="tripId" value={tripId} />
          <Button type="submit" variant="secondary" disabled={create.pending}>
            {hasLink ? t("shareRegenerate") : t("shareCreate")}
          </Button>
        </form>
        {hasLink && (
          <form onSubmit={revoke.submit}>
            <input type="hidden" name="tripId" value={tripId} />
            <Button type="submit" variant="ghost" disabled={revoke.pending}>
              {t("shareRevoke")}
            </Button>
          </form>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <FormAlert message={createError} />
        <FormAlert message={revokeError} />
      </div>
    </div>
  );
}
