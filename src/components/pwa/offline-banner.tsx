"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Avviso in cima alla pagina quando il dispositivo è offline. Il contenitore resta sempre nel DOM
// perché il lettore di schermo annunci il cambio; aria-live senza role=status, come da regole.
export function OfflineBanner() {
  const t = useTranslations("Pwa");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div aria-live="polite" className={offline ? "border-b border-divider bg-calce-sunk text-lava" : undefined}>
      {offline && <p className="mx-auto max-w-[1200px] px-4 py-2 text-body-s md:px-6">{t("offlineBanner")}</p>}
    </div>
  );
}
