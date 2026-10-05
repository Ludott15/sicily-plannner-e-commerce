import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormNotice } from "@/components/admin/fields";
import { AuthorForm } from "@/components/admin/tip-forms";
import { Link } from "@/lib/i18n/navigation";
import { saveAuthor } from "@/server/catalog/admin-tips-actions.admin";
import { adminListAuthors } from "@/server/catalog/admin-tips-queries.admin";

// Autori dei consigli: la redazione, oppure persone reali che hanno dato il consenso
// (data obbligatoria). Mai autori inventati.
export default async function AdminTipAuthorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ salvato?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, authors, { salvato }] = await Promise.all([getTranslations("Admin"), adminListAuthors(), searchParams]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("tipAuthors")}</h1>
        <Link href="/admin/consigli">{t("backToList")}</Link>
      </div>
      <p className="text-body-s text-lava-muted">{t("tipAuthorsHint")}</p>
      <FormNotice message={salvato ? t("saved") : null} />
      {authors.map((a) => (
        <AuthorForm
          key={a.id}
          action={saveAuthor}
          locale={locale}
          values={{ ...a, consentAt: a.consentAt ? a.consentAt.toISOString().slice(0, 10) : null }}
        />
      ))}
      <h2 className="is-display text-heading-2">{t("newAuthor")}</h2>
      <AuthorForm
        action={saveAuthor}
        locale={locale}
        values={{ kind: "editorial", displayName: "", bio: null, photoUrl: null, consentAt: null, isActive: true }}
      />
    </section>
  );
}
