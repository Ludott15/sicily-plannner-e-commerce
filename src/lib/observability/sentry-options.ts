// Opzioni di Sentry condivise tra server e browser (passo 11.5). Nessun import dell'SDK qui: il file
// è puro e si testa da solo. Senza DSN nessun SDK viene inizializzato e nessuna richiesta parte.
import { scrubSentryEvent } from "./scrub";

type Env = Record<string, string | undefined>;

// DSN dell'ambiente: NEXT_PUBLIC_SENTRY_DSN (anche nel browser) oppure SENTRY_DSN (solo server).
export function sentryDsn(env: Env): string | undefined {
  const dsn = (env.NEXT_PUBLIC_SENTRY_DSN ?? env.SENTRY_DSN ?? "").trim();
  return dsn === "" ? undefined : dsn;
}

// Release = commit del deploy, così gli errori si collegano al codice che li ha prodotti.
// Sul server è VERCEL_GIT_COMMIT_SHA; nel browser la variabile pubblica equivalente di Vercel.
export function sentryRelease(env: Env): string | undefined {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").trim();
  return sha === "" ? undefined : sha;
}

// Ogni evento e ogni breadcrumb passano dalla pulizia prima di lasciare il sito.
export function scrubBeforeSend<E>(event: E): E {
  return scrubSentryEvent(event);
}

// Nessun dato personale di default (niente IP, niente utente), nessun trace e nessun replay:
// la sessione registrata conterrebbe ciò che l'utente vede.
export const SENTRY_COMMON_OPTIONS = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: scrubBeforeSend,
  beforeBreadcrumb: scrubBeforeSend,
} as const;
