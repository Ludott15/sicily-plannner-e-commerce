import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormNotice } from "@/components/admin/fields";
import { VerifyTipButton } from "@/components/admin/tip-forms";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { markTipVerified } from "@/server/catalog/admin-tips-actions.admin";
import { adminListTips } from "@/server/catalog/admin-tips-queries.admin";

// Consigli locali: prima la coda "Da riverificare" (scaduti o in scadenza entro 30 giorni:
// dopo 12 mesi senza riverifica escono dalle pagine), poi tutti gli altri.
export default async function AdminTipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ salvato?: string; riverificato?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tips, { salvato, riverificato }] = await Promise.all([getTranslations("Admin"), adminListTips(), searchParams]);
  const due = tips.filter((tip) => tip.isActive && tip.due);
  const others = tips.filter((tip) => !(tip.isActive && tip.due));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const day = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));

  const row = (tip: (typeof tips)[number], verify: boolean) => (
    <li key={tip.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-divider py-3">
      <div className="flex max-w-2xl flex-col gap-1">
        <Link href={`/admin/consigli/${tip.id}`} className="text-body font-semibold">
          {tip.target} · {tip.author}
        </Link>
        <span className="line-clamp-2 text-body-s text-lava-muted">{tip.body}</span>
        <span className="text-caption text-lava-muted">
          {t("tipVerifiedOn", { date: day(tip.verifiedAt) })} ·{" "}
          {tip.expired ? t("tipExpired") : t("tipExpiresOn", { date: day(tip.expiresOn) })}
          {!tip.isActive && ` · ${t("tipInactive")}`}
        </span>
      </div>
      {verify && <VerifyTipButton action={markTipVerified} locale={locale} id={tip.id} />}
    </li>
  );

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("tips")}</h1>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/admin/consigli/autori" variant="secondary">
            {t("tipAuthors")}
          </ButtonLink>
          <ButtonLink href="/admin/consigli/nuovo" variant="primary">
            {t("newTip")}
          </ButtonLink>
        </div>
      </div>
      <FormNotice message={salvato ? t("saved") : riverificato ? t("tipVerifiedNotice") : null} />

      <section aria-labelledby="da-riverificare" className="flex flex-col gap-2">
        <h2 id="da-riverificare" className="is-display text-heading-2">
          {t("tipsDue")}
        </h2>
        <p className="text-body-s text-lava-muted">{t("tipsDueHint")}</p>
        {due.length === 0 ? <p className="text-body">{t("tipsDueEmpty")}</p> : <ul>{due.map((tip) => row(tip, true))}</ul>}
      </section>

      <section aria-labelledby="tutti-i-consigli" className="flex flex-col gap-2">
        <h2 id="tutti-i-consigli" className="is-display text-heading-2">
          {t("tipsAll")}
        </h2>
        {others.length === 0 ? <p className="text-body">{t("empty")}</p> : <ul>{others.map((tip) => row(tip, false))}</ul>}
      </section>
    </section>
  );
}
