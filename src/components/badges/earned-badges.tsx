"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Stamp } from "@/components/design";

// Timbri dei badge ottenuti (passo 5.2). Un badge è "nuovo" se è stato ottenuto dopo l'ultima visita
// a /punti: la data della visita sta nel localStorage di questo browser, nessuna scrittura sul server.
// Alla prima visita (nessuna data salvata) ogni timbro ottenuto è nuovo; poi si registra la data.
// Il calcolo sta in un effetto, così il render del server e quello iniziale del client coincidono.

export type EarnedBadgeView = { key: string; name: string; awardedAt: string };

const LAST_VISIT_KEY = "isula.punti.ultimaVisita";

function readLastVisit(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_VISIT_KEY);
    if (raw === null) return null;
    const time = Date.parse(raw);
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
}

function writeLastVisit(time: number): void {
  try {
    window.localStorage.setItem(LAST_VISIT_KEY, new Date(time).toISOString());
  } catch {
    // Archiviazione non disponibile (finestra privata, dati bloccati): senza memoria della visita ogni
    // timbro ottenuto risulta nuovo alla visita successiva. Nessun errore mostrato.
  }
}

export function EarnedBadges({ items }: { items: EarnedBadgeView[] }) {
  const t = useTranslations("Badges");
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Calcolato una sola volta per montaggio: con la doppia esecuzione degli effetti in sviluppo il
  // secondo passaggio non deve leggere la data appena scritta.
  const computed = useRef<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (computed.current === null) {
      const lastVisit = readLastVisit() ?? 0;
      computed.current = new Set<string>(
        items.filter((item) => Date.parse(item.awardedAt) > lastVisit).map((item) => item.key),
      );
      writeLastVisit(Date.now());
    }
    setNewKeys(computed.current);
  }, [items]);

  if (items.length === 0) {
    return <p className="text-body text-lava-muted">{t("earnedEmpty")}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-6">
      {items.map((item) => {
        const isNew = newKeys.has(item.key);
        return (
          <li key={item.key} className="flex flex-col items-center gap-2">
            <Stamp badgeKey={item.key} name={item.name} isNew={isNew} />
            {isNew && <p className="text-label uppercase text-lava-muted">{t("newLabel")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
