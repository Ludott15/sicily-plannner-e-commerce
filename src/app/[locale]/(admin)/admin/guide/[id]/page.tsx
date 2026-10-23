import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuideForm } from "@/components/admin/guide-form";
import { GuideLinksForm, type GuideLinkKind, type GuideLinkOption } from "@/components/admin/guide-links-form";
import { GuideStatusForm } from "@/components/admin/guide-status-form";
import { Link } from "@/lib/i18n/navigation";
import { getGuideForEdit, listLinkTargets } from "@/server/editorial/admin-queries.admin";
import { deleteGuide, publishGuide, saveGuide, setGuideLinks, unpublishGuide } from "@/server/editorial/admin-actions.admin";
import { listAdminMedia } from "@/server/media/admin-queries.admin";

// Modifica di una guida: testo bilingue con anteprima, collegamenti scelti da elenchi, pubblicazione
// e ritiro. Pubblicare, ritirare ed eliminare chiedono conferma. La bozza non è visibile al pubblico.
export default async function EditGuidePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [t, guide, media, targets] = await Promise.all([
    getTranslations("Admin"),
    getGuideForEdit(id),
    listAdminMedia("all"),
    listLinkTargets(),
  ]);
  if (!guide) notFound();

  const optionsOf = (kind: GuideLinkKind): GuideLinkOption[] =>
    targets.flatMap((target) => (target.kind === kind ? [{ id: target.id, label: target.title }] : []));
  const selected = [...guide.links]
    .sort((a, b) => a.position - b.position)
    .map((link) => ({ kind: link.kind, targetId: link.targetId }));

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{guide.titleIt}</h1>
        <Link href="/admin/guide">{t("backToList")}</Link>
      </div>
      <p className="text-body-s text-lava-muted">
        {guide.status === "published" ? t("guides.statusPublished") : t("guides.statusDraft")} · {guide.slug}
      </p>

      <GuideForm
        action={saveGuide}
        covers={media.map((m) => ({ id: m.id, label: m.altIt?.trim() || t("guides.untitledMedia") }))}
        values={{
          id: guide.id,
          slug: guide.slug,
          titleIt: guide.titleIt,
          titleEn: guide.titleEn ?? "",
          summaryIt: guide.summaryIt ?? "",
          summaryEn: guide.summaryEn ?? "",
          bodyIt: guide.bodyIt,
          bodyEn: guide.bodyEn ?? "",
          authorName: guide.authorName,
          coverMediaId: guide.coverMediaId ?? "",
        }}
      />

      <section aria-labelledby="collegamenti-admin" className="flex flex-col gap-4">
        <h2 id="collegamenti-admin" className="is-display text-heading-2">
          {t("guides.links.title")}
        </h2>
        <GuideLinksForm
          action={setGuideLinks}
          guideId={guide.id}
          options={{
            place: optionsOf("place"),
            activity: optionsOf("activity"),
            itinerary: optionsOf("itinerary"),
            product: optionsOf("product"),
          }}
          selected={selected}
        />
      </section>

      <section aria-labelledby="pubblicazione" className="flex flex-col gap-4">
        <h2 id="pubblicazione" className="is-display text-heading-2">
          {t("guides.publishTitle")}
        </h2>
        {guide.status === "published" ? (
          <GuideStatusForm action={unpublishGuide} guideId={guide.id} intent="unpublish" />
        ) : (
          <GuideStatusForm action={publishGuide} guideId={guide.id} intent="publish" />
        )}
        <GuideStatusForm action={deleteGuide} guideId={guide.id} intent="delete" />
      </section>
    </section>
  );
}
