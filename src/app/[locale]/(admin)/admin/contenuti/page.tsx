import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, ButtonAnchor } from "@/components/design";
import { Select } from "@/components/admin/fields";
import { adminListPlaces, adminListTemplates } from "@/server/catalog/admin-queries.admin";

// Contenuti video (passo 6.3): un itinerario pronto o un luogo, l'immagine verticale 1080×1920
// con la foto e le tappe, da scaricare come PNG. Nessuna scrittura: la pagina legge il catalogo
// (anche le bozze) e genera l'immagine con la route accanto.

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scelta?: string }>;
};

const CHOICE = /^(itinerario|luogo):([0-9a-f-]{36})$/;

export default async function AdminContentPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scelta } = await searchParams;
  const [t, templates, places] = await Promise.all([
    getTranslations("AdminContent"),
    adminListTemplates(),
    adminListPlaces(),
  ]);

  const match = CHOICE.exec(scelta ?? "");
  const imageHref = match ? `/${locale}/admin/contenuti/immagine?tipo=${match[1]}&id=${match[2]}` : null;

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-body font-semibold">
          {t("choose")}
          <Select name="scelta" defaultValue={scelta ?? ""} className="font-normal">
            <option value="">{t("choosePlaceholder")}</option>
            <optgroup label={t("templatesGroup")}>
              {templates.map((template) => (
                <option key={template.id} value={`itinerario:${template.id}`}>
                  {template.title}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("placesGroup")}>
              {places.map((place) => (
                <option key={place.id} value={`luogo:${place.id}`}>
                  {place.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          {t("preview")}
        </Button>
      </form>

      {imageHref ? (
        <section aria-labelledby="contenuti-anteprima" className="flex flex-col gap-6 md:flex-row md:items-start">
          <h2 id="contenuti-anteprima" className="sr-only">
            {t("previewTitle")}
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageHref}
            alt={t("imageAlt")}
            width={1080}
            height={1920}
            className="h-auto w-full max-w-[300px] rounded-lg shadow-card"
          />
          <div className="flex flex-col items-start gap-3">
            <p className="text-body-s text-lava-muted">{t("size")}</p>
            <ButtonAnchor href={imageHref} download variant="primary">
              {t("download")}
            </ButtonAnchor>
          </div>
        </section>
      ) : (
        <p className="text-body text-lava-muted">{t("noSelection")}</p>
      )}
    </section>
  );
}
