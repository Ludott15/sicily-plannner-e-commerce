import { sentryDsn } from "@/lib/observability/sentry-options";

// Next chiama register() una volta per avvio del server. Sentry lato server parte solo se c'è un DSN:
// senza, nessun modulo di Sentry viene caricato e nessuna richiesta esce dal sito (passo 11.5).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!sentryDsn(process.env)) return;
  await import("./sentry.server.config");
}

// Errori delle richieste lato server (pagine, route, azioni): inviati a Sentry solo con un DSN.
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!sentryDsn(process.env)) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
