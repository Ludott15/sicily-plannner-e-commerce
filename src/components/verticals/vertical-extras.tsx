import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

// Sezioni sotto il form di ogni verticale: consigli con fatti verificati, domande frequenti, guide
// pertinenti (solo slug già pubblicati), altri siti partner e la nota di trasparenza sugli affiliati.

export type FaqItem = { question: string; answer: string };
export type GuideLinkItem = { slug: string; title: string };
export type AlternativeItem = { href: string; name: string };

type VerticalExtrasProps = {
  tips: string[];
  faq: FaqItem[];
  guides: GuideLinkItem[];
  alternatives: AlternativeItem[];
};

export async function VerticalExtras({ tips, faq, guides, alternatives }: VerticalExtrasProps) {
  const t = await getTranslations("Verticals");

  return (
    <div className="flex flex-col gap-12">
      {alternatives.length > 0 && (
        <section aria-labelledby="vertical-alternatives-title" className="flex flex-col gap-3">
          <h2 id="vertical-alternatives-title" className="text-heading-3">
            {t("alternatives")}
          </h2>
          <p className="text-body text-lava-muted">{t("alternativesText")}</p>
          <ul className="flex flex-wrap gap-2">
            {alternatives.map((alt) => (
              <li key={alt.href}>
                <a
                  href={alt.href}
                  className="inline-flex min-h-11 items-center rounded-pill border border-border-control px-4 text-body-s"
                >
                  {t("tryOn", { partner: alt.name })}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tips.length > 0 && (
        <section aria-labelledby="vertical-tips-title" className="flex flex-col gap-3">
          <h2 id="vertical-tips-title" className="text-heading-3">
            {t("tipsTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {faq.length > 0 && (
        <section aria-labelledby="vertical-faq-title" className="flex flex-col gap-4">
          <h2 id="vertical-faq-title" className="text-heading-3">
            {t("faqTitle")}
          </h2>
          <dl className="flex flex-col gap-5">
            {faq.map((item) => (
              <div key={item.question} className="flex flex-col gap-1">
                <dt className="text-body font-semibold">{item.question}</dt>
                <dd className="text-body text-lava-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {guides.length > 0 && (
        <section aria-labelledby="vertical-guides-title" className="flex flex-col gap-3">
          <h2 id="vertical-guides-title" className="text-heading-3">
            {t("guidesTitle")}
          </h2>
          <ul className="flex flex-col gap-2">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <Link href={`/guide/${guide.slug}`} className="text-body underline underline-offset-4">
                  {guide.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-caption text-lava-muted">
        {t.rich("transparency", {
          affiliates: (chunks) => (
            <Link href="/affiliazioni" className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
