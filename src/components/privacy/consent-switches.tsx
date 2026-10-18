"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordConsentAction, type PrivacyErrorCode } from "@/server/privacy/actions";

// Interruttori dei consensi in Account › Privacy (passo 8.2). Ogni interruttore registra una nuova
// riga nel registro (mai una modifica): lo stato mostrato è quello dell'ultima riga. Lo stato
// acceso/spento è scritto a parole accanto all'interruttore (non solo colore).

export type ConsentView = {
  kind: "profiling" | "location" | "sensitive";
  title: string;
  text: string;
  granted: boolean;
  changedLabel: string;
};

export function ConsentSwitches({ consents }: { consents: ConsentView[] }) {
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {consents.map((consent) => (
        <li key={consent.kind}>
          <ConsentSwitch consent={consent} />
        </li>
      ))}
    </ul>
  );
}

function ConsentSwitch({ consent }: { consent: ConsentView }) {
  const t = useTranslations("Privacy");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Lo stato confermato dal server è locale: useOptimistic torna a questo valore quando la
  // transizione finisce. Se tornasse alla prop (aggiornata solo dopo router.refresh), il secondo
  // clic invierebbe di nuovo "concesso" e il registro non riceverebbe la revoca.
  const [saved, setSaved] = useState(consent.granted);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [error, setError] = useState<PrivacyErrorCode | null>(null);
  const titleId = `consent-${consent.kind}-title`;
  const textId = `consent-${consent.kind}-text`;

  function toggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await recordConsentAction({ kind: consent.kind, granted: next });
      if (result.status === "ok") setSaved(next);
      else setError(result.code);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={titleId} className="text-body font-semibold">
            {consent.title}
          </h3>
          <p id={textId} className="text-body-s text-pretty text-lava-muted">
            {consent.text}
          </p>
          <p className="text-caption text-lava-muted">{consent.changedLabel}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optimistic}
          aria-labelledby={titleId}
          aria-describedby={textId}
          disabled={pending}
          onClick={toggle}
          className="relative inline-flex min-h-11 w-14 shrink-0 items-center rounded-pill border-[1.5px] border-border-control bg-calce-sunk px-1 transition-colors aria-checked:bg-lava disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span
            aria-hidden="true"
            className="size-6 rounded-full bg-calce-raised shadow-card transition-transform aria-checked:translate-x-5"
          />
        </button>
      </div>
      <p className="text-body-s font-semibold">{optimistic ? t("on") : t("off")}</p>
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
