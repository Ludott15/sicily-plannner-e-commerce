import * as Sentry from "@sentry/nextjs";
import { SENTRY_COMMON_OPTIONS, sentryDsn, sentryRelease } from "@/lib/observability/sentry-options";

// Inizializzazione di Sentry sul server. Caricata da src/instrumentation.ts solo con un DSN.
const dsn = sentryDsn(process.env);

if (dsn) {
  Sentry.init({
    dsn,
    release: sentryRelease(process.env),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    ...SENTRY_COMMON_OPTIONS,
  });
}
