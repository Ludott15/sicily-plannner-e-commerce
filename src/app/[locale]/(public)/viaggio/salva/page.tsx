import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { StartTripForm } from "@/components/trips/start-trip-form";
import { parsePairKey } from "@/lib/drive-pairs";
import { getUser } from "@/server/auth";
import { getTemplate } from "@/server/catalog/queries";
import { areaNames } from "@/server/personalization/data";

// Salva un viaggio (M5): da un itinerario pronto (?da=<slug>, "Usa questo itinerario") o da una
// delle proposte (?area=<slug>&variante=<interesse>, "Salva questo viaggio"). Chiede date e
// persone, poi crea l'itinerario dell'utente, anche ospite. Pagina personale: non indicizzata.
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
  const [t, tProposals, user] = await Promise.all([getTranslations("Trips"), getTranslations("Proposals"), getUser()]);

  let source: { kind: "template"; slug: string } | { kind: "proposal"; area: string; variant: string | null };
  let name: string;
  if (da && slug.safeParse(da).success) {
    const template = await getTemplate(da);
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

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-display-l">{t("saveTitle")}</h1>
        <p className="text-body-l text-pretty text-lava-muted">{t("saveIntro", { name })}</p>
      </div>
      <StartTripForm locale={locale} source={source} needsSession={!user} />
    </section>
  );
}
