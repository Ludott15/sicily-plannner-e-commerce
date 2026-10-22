import { SENTRY_COMMON_OPTIONS, sentryDsn, sentryRelease } from "@/lib/observability/sentry-options";

// Sentry nel browser (passo 11.5). Le variabili pubbliche vanno lette per nome, così Next le sostituisce
// nel bundle: senza NEXT_PUBLIC_SENTRY_DSN al build il ramo non esiste e l'SDK non entra nel bundle.
const clientEnv = {
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
};
const dsn = sentryDsn(clientEnv);

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      release: sentryRelease(clientEnv),
      environment: process.env.NODE_ENV,
      ...SENTRY_COMMON_OPTIONS,
    });
  });
}
