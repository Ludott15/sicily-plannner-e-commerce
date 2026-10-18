"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { shouldOfferInstall } from "@/lib/install-prompt";
import { INSTALL_DISMISSED_KEY } from "@/lib/pwa";

// Invito all'installazione nella pagina "I miei viaggi" (passo 11.3). La regola è in shouldOfferInstall:
// almeno due viaggi, non nel browser di un'app social, non già installata, non chiuso con "Non ora".
// Chrome, Edge e Android danno l'evento beforeinstallprompt, che si conserva per il pulsante; iOS Safari
// non lo dà e mostra le istruzioni a testo. Un evento senza prompt() non rompe nulla: si mostra il testo.

// Evento non standard (Chrome, Edge, Android): non è nei tipi del DOM.
type BeforeInstallPromptEvent = Event & {
  prompt?: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Props = {
  /** Viaggi salvati dall'utente, contati dal server. */
  trips: number;
  /** Il sito è aperto nel browser interno di un'app social. */
  inApp: boolean;
};

// localStorage può mancare o lanciare errore (modalità privata, dati del sito bloccati).
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// iOS Safari non dà l'evento di installazione: si mostrano le istruzioni. Il valore viene dal browser
// e non cambia durante la visita; sul server (senza navigator) vale false, come nel primo render.
function subscribeNothing(): () => void {
  return () => {};
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Senza memoria l'invito torna alla prossima visita: nessun errore da mostrare.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt({ trips, inApp }: Props) {
  const t = useTranslations("Pwa.install");
  const ios = useSyncExternalStore(subscribeNothing, isIosDevice, () => false);
  // Regola letta dal browser (installazione, "Non ora"); "hidden" copre la chiusura appena fatta.
  const eligible = useSyncExternalStore(
    subscribeNothing,
    () => shouldOfferInstall({ trips, inApp, standalone: isStandalone(), dismissed: readDismissed() }),
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  const offer = eligible && !hidden;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      const candidate = event as BeforeInstallPromptEvent;
      if (typeof candidate.prompt === "function") setDeferred(candidate);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!offer) return null;

  async function install() {
    if (!deferred?.prompt) return;
    try {
      await deferred.prompt();
    } catch {
      // Il prompt del browser non si è aperto: si chiude l'invito come le altre volte.
    }
    setDeferred(null);
    setHidden(true);
  }

  function dismiss() {
    writeDismissed();
    setHidden(true);
  }

  return (
    <section aria-labelledby="install-title" className="flex flex-col gap-3 rounded-lg border border-divider bg-calce-raised p-5 md:p-6">
      <h2 id="install-title" className="text-heading-3">
        {t("title")}
      </h2>
      <p className="text-body text-lava-muted">{t("text")}</p>
      {deferred ? (
        <div>
          <Button variant="secondary" onClick={install}>
            {t("button")}
          </Button>
        </div>
      ) : (
        <p className="text-body-s text-lava-muted">{ios ? t("ios") : t("generic")}</p>
      )}
      <div>
        <Button variant="ghost" onClick={dismiss}>
          {t("later")}
        </Button>
      </div>
    </section>
  );
}
