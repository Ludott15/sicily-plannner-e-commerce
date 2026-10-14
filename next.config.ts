import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

export default withNextIntl(nextConfig);
