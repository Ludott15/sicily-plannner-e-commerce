import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DesignShowcase } from "./showcase";

// Catalogo dei componenti del design system nei due temi. Solo in sviluppo:
// in produzione la route risponde 404.
export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

export default async function DevDesignPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-col">
      <section data-theme="light" className="is-root" aria-labelledby="tema-chiaro">
        <DesignShowcase themeId="tema-chiaro" themeLabel="Tema chiaro" />
      </section>
      <section data-theme="dark" className="is-root" aria-labelledby="tema-scuro">
        <DesignShowcase themeId="tema-scuro" themeLabel="Tema scuro" />
      </section>
    </div>
  );
}
