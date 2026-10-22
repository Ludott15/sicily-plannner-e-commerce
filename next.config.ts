import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Le immagini del catalogo hanno varianti già generate a queste larghezze
    // (VARIANT_WIDTHS in src/lib/media.ts): il loader di CoverPicture le sceglie dal srcset.
    deviceSizes: [480, 800, 1200, 1600],
    imageSizes: [],
  },
  experimental: {
    serverActions: {
      // Il CSV di importazione pesa fino a MAX_IMPORT_BYTES (2 MB) più i byte del multipart:
      // il limite predefinito delle server action è 1 MB.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      {
        // Service worker (passo 11.3): mai in cache HTTP, così il browser riprende sempre la versione nuova.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Pagina delle affiliazioni (passo 3.1): il vecchio percorso /link-affiliati resta per i link
      // già in circolazione. 308 (permanente), come da docs Next 16 (redirects in next.config).
      {
        source: "/:locale(it|en)/link-affiliati",
        destination: "/:locale/affiliazioni",
        permanent: true,
      },
    ];
  },
};

const nextConfigWithIntl = withNextIntl(nextConfig);

// Sourcemap a Sentry solo con SENTRY_AUTH_TOKEN (passo 11.5): il caricamento è la sola ragione di avvolgere
// la configurazione. Senza token il build non tocca Sentry, e le sourcemap caricate vengono cancellate dal
// build, così non sono pubbliche. Il runtime non dipende da questo: lo attiva il DSN in src/instrumentation*.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default sentryAuthToken
  ? withSentryConfig(nextConfigWithIntl, {
      authToken: sentryAuthToken,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      buildTimeInstrumentation: false,
    })
  : nextConfigWithIntl;
