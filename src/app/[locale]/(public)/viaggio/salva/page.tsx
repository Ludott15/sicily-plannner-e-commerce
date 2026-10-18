import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { StartTripForm } from "@/components/trips/start-trip-form";
import { parsePairKey } from "@/lib/drive-pairs";
import { getUser } from "@/server/auth";
import { getTemplate } from "@/server/catalog/queries";
import { areaNames } from "@/server/personalization/data";

// Salva un viaggio (M5): da un itinerario pronto (?da=<slug>, "Usa questo itinerario") o da una
// delle proposte (?area=<slug>&variante=<interesse>, "Salva questo viaggio"). Un passo solo: il
// riepilogo di quello che si salva (per l'itinerario pronto: foto e fatti; per la proposta: il
// nome della zona) e, nella stessa carta, data di partenza e persone con l'azione principale.
// Crea l'itinerario dell'utente, anche ospite. Pagina personale: non indicizzata.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ da?: string; area?: string; variante?: string }>;
};

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
// Area di una proposta: uno slug, o la chiave di una coppia di aree ("ovest+palermo").
const areaKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(\+[a-z0-9]+(-[a-z0-9]+)*)?$/).max(241);
const interest = z.string().regex(/^[a-z_]{1,40}$/);

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Trips" });
  return { title: t("saveTitle"), robots: { index: false, follow: false } };
}

export default async function SaveTripPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { da, area, variante } = await searchParams;
  const [t, tProposals, tCatalog, user] = await Promise.all([
    getTranslations("Trips"),
    getTranslations("Proposals"),
    getTranslations("Catalog"),
    getUser(),
  ]);

  let source: { kind: "template"; slug: string } | { kind: "proposal"; area: string; variant: string | null };
  let template: Awaited<ReturnType<typeof getTemplate>> = null;
  let name: string;
  if (da && slug.safeParse(da).success) {
    template = await getTemplate(da);
    if (!template) notFound();
    source = { kind: "template", slug: da };
    name = template.title;
  } else if (area && areaKey.safeParse(area).success && (!variante || interest.safeParse(variante).success)) {
    // Le proposte esistono solo per chi ha risposto alle domande: serve già una sessione.
    if (!user) notFound();
    const names = await areaNames(locale);
    const parts = parsePairKey(area) ?? [area];
    if (!parts.every((part) => names.has(part))) notFound();
    source = { kind: "proposal", area, variant: variante ?? null };
    const [first, second] = parts;
    name =
      second === undefined
        ? names.get(area)!
        : tProposals("pairName", { first: names.get(first ?? "")!, second: names.get(second) ?? "" });
  } else {
    notFound();
  }

  const areaName = (a: { nameIt: string; nameEn: string }) => (locale === "en" ? a.nameEn : a.nameIt);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-8 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="is-display text-display-l text-balance">{t("saveTitle")}</h1>
        <p className="text-body-l text-pretty text-lava-muted">{t("saveIntro", { name })}</p>
      </header>

      <article className="flex flex-col gap-8 rounded-lg border border-card-edge bg-calce-raised p-5 shadow-card md:p-8">
        {template ? (
          <div className="flex flex-col gap-6">
            <CoverFigure
              cover={template.cover}
              ratio="16x9"
              sizes="(min-width: 640px) 576px, 100vw"
              locale={locale}
              placeholder={template.title}
              frameClassName="aspect-[16/9]"
            />
            <div className="flex flex-col gap-2">
              <p className="text-label uppercase text-lava-muted">
                {tCatalog("readyEyebrow", { days: tCatalog("days", { count: template.days }) })}
              </p>
              <h2 className="is-display text-heading-2 text-balance">{template.title}</h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-divider pt-5">
              <div className="flex flex-col gap-1">
                <dt className="text-label uppercase text-lava-muted">{tCatalog("summaryDuration")}</dt>
                <dd className="text-body">{tCatalog("days", { count: template.days })}</dd>
              </div>
              {template.facts.areas.length > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-label uppercase text-lava-muted">{tCatalog("summaryAreas")}</dt>
                  <dd className="text-body">{template.facts.areas.map(areaName).join(", ")}</dd>
                </div>
              )}
              {template.pace && (
                <div className="flex flex-col gap-1">
                  <dt className="text-label uppercase text-lava-muted">{tCatalog("summaryPace")}</dt>
                  <dd className="text-body">{tCatalog(`paceLabel.${template.pace}`)}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <dt className="text-label uppercase text-lava-muted">{tCatalog("summaryCar")}</dt>
                <dd className="text-body">{template.facts.requiresCar ? tCatalog("carYes") : tCatalog("carNo")}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <h2 className="is-display text-heading-2 text-balance">{name}</h2>
        )}

        <div className="border-t border-divider pt-8">
          <StartTripForm locale={locale} source={source} needsSession={!user} />
        </div>
      </article>
    </section>
  );
}
