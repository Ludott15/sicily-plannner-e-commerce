"use client";

import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env";

// Cloudflare Turnstile: CAPTCHA richiesto da Supabase per la sessione ospite e l'invio del
// codice. Modalità "interaction-only": il widget compare solo se Cloudflare chiede
// un'interazione, altrimenti la verifica è invisibile. Il token vale una sola volta: dopo
// ogni tentativo il chiamante rimonta il componente (key) per averne uno nuovo.

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Turnstile({
  locale,
  onToken,
  onError,
}: {
  locale: string;
  onToken: (token: string | null) => void;
  onError?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Le callback cambiano a ogni render: il widget legge sempre le ultime.
  const callbacks = useRef({ onToken, onError });
  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return;
        widgetId = api.render(ref.current, {
          sitekey: publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          language: locale,
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onError?.();
          },
        });
      })
      .catch(() => callbacks.current.onError?.());
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [locale]);

  return <div ref={ref} />;
}
