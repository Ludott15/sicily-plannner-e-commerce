"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { consentCookie, OPEN_PREFERENCES_EVENT, type Consent } from "@/lib/consent";

// Banner dei cookie: "Accetta" e "Rifiuta" con la stessa evidenza (stesso stile, stessa
// dimensione), nessuna scelta preselezionata. Compare finché non si sceglie; si riapre da
// "Preferenze cookie" nel footer. La scelta resta in un cookie tecnico (src/lib/consent.ts).
export function CookieBanner({ initial }: { initial: Consent | null }) {
  const t = useTranslations("Cookies");
  const [open, setOpen] = useState(initial === null);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, reopen);
  }, []);

  function choose(consent: Consent) {
    document.cookie = consentCookie(consent, window.location.protocol === "https:");
    setOpen(false);
  }

  if (!open) return null;
  return (
    <section
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-calce-raised shadow-lift"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-5 pb-[max(env(safe-area-inset-bottom),20px)] md:flex-row md:items-center md:justify-between md:px-16">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="cookie-banner-title" className="text-body font-semibold">
            {t("title")}
          </h2>
          <p className="text-body-s text-lava-muted">
            {t.rich("text", { cookie: (chunks) => <Link href="/cookie">{chunks}</Link> })}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => choose("rejected")}>
            {t("reject")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => choose("accepted")}>
            {t("accept")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function CookiePreferencesButton({ className }: { className?: string }) {
  const t = useTranslations("Cookies");
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))}>
      {t("preferences")}
    </button>
  );
}
