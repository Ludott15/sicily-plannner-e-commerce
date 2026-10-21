"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/design";

// Copia il testo di una risposta dell'assistente. Se il browser nega gli appunti il pulsante resta com'è:
// nessun messaggio d'errore per una funzione accessoria. Il timer che riporta "Copia" si annulla allo
// smontaggio, così non arriva un aggiornamento su un componente già tolto dalla pagina.
const COPIED_MS = 2000;

export function ChatCopyButton({ text }: { text: string }) {
  const t = useTranslations("Chat");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const timers = timerRef;
    return () => {
      if (timers.current !== null) window.clearTimeout(timers.current);
    };
  }, []);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, COPIED_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2 text-body-s text-lava-muted">
      {copied ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.5} aria-hidden="true" />}
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}
