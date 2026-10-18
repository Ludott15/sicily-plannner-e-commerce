import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProducerForm } from "@/components/admin/producer-form";
import type { ProducerFormValues } from "@/lib/shop/form-values";
import { listProducersAdmin, saveProducer } from "@/server/shop/producers.admin";
import { listShopFormOptions } from "@/server/shop/options.admin";

// Produttori di origine (passo 7.1): il marchio con la storia e il territorio. Solo admin.
// Un produttore è visibile nello shop solo se è pubblico e attivo.
export default async function ProducersAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows, options] = await Promise.all([
    getTranslations("Admin.shop"),
    listProducersAdmin(),
    listShopFormOptions(),
  ]);

  const empty: ProducerFormValues = {
    id: null,
    slug: "",
    name: "",
    email: null,
    vatNumber: null,
    address: null,
    storyIt: null,
    storyEn: null,
    areaId: null,
    placeId: null,
    isPublic: false,
    isActive: true,
  };

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("producersTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("producersIntro")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="is-display text-heading-2">{t("newProducer")}</h2>
        <ProducerForm action={saveProducer} values={empty} options={options} />
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-10">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3">
              <h2 className="is-display text-heading-2">{row.name}</h2>
              <ProducerForm action={saveProducer} values={row} options={options} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
