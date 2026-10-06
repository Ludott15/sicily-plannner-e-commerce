import { getTranslations, setRequestLocale } from "next-intl/server";
import { MediaDetailsForm } from "@/components/admin/media/media-details-form";
import { MediaUploader } from "@/components/admin/media/media-uploader";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { Link } from "@/lib/i18n/navigation";
import { prepareMediaUploads, processMediaUpload, saveMediaDetails } from "@/server/media/admin-actions.admin";
import { listAdminMedia, listAuthorizations, mediaProblems } from "@/server/media/admin-queries.admin";

// Immagini del catalogo: caricamento multiplo (abbinamento per nome file) e tabella per
// completare testo alternativo, tipo, autore e licenza. "Da completare" mostra i media
// bloccati, che le pagine pubbliche non usano.
export default async function AdminMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { filtro } = await searchParams;
  const filter = filtro === "tutte" ? "all" : "todo";
  const [t, rows, authorizations] = await Promise.all([getTranslations("Admin"), listAdminMedia(filter), listAuthorizations()]);
  const today = new Date().toISOString().slice(0, 10);
  const authorizationOptions = authorizations.map((a) => ({
    id: a.id,
    label: `${a.authority} · ${a.reference} · ${a.validUntil}`,
    expired: a.validUntil < today,
  }));

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("media")}</h1>
        <div className="flex flex-wrap gap-4 text-body">
          <Link href="/admin/media/foto-commons">{t("photoFinderTitle")}</Link>
          <Link href="/admin/media/commons">{t("commonsTitle")}</Link>
          <Link href="/admin/media/autorizzazioni">{t("authorizationsTitle")}</Link>
        </div>
      </div>

      <MediaUploader prepare={prepareMediaUploads} process={processMediaUpload} />

      <nav aria-label={t("mediaFilter")} className="flex gap-6 text-body">
        <Link href="/admin/media" aria-current={filter === "todo" ? "page" : undefined} className="font-semibold">
          {t("mediaFilterTodo")}
        </Link>
        <Link href="/admin/media?filtro=tutte" aria-current={filter === "all" ? "page" : undefined} className="font-semibold">
          {t("mediaFilterAll")}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="text-body-l text-lava-muted">{filter === "todo" ? t("mediaTodoEmpty") : t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider" data-testid="media-table">
          {rows.map((m) => {
            const problems = mediaProblems(m, today);
            return (
              <li key={m.id} className="grid gap-4 py-6 md:grid-cols-[160px_1fr]" data-media={m.id}>
                <div className="flex flex-col gap-2">
                  <div className="relative aspect-[4/5] w-40 overflow-hidden rounded-md bg-calce-sunk">
                    <CoverPicture cover={m} ratio="4x5" sizes="160px" locale={locale} />
                  </div>
                  <Link href={`/admin/media/${m.id}`} className="text-body-s">
                    {t("mediaOpen")}
                  </Link>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-body-s text-lava-muted">
                    {m.originalFilename ?? m.id} · {m.width}×{m.height}
                    {m.usedBy.length > 0
                      ? ` · ${t("mediaUsedBy")}: ${m.usedBy.map((u) => u.name).join(", ")}`
                      : ` · ${t("mediaUnused")}`}
                  </p>
                  {problems.length > 0 && (
                    <p className="text-body-s font-semibold text-danger">
                      {t("mediaBlocked")}: {problems.map((p) => t(`mediaProblem.${p}`)).join(" · ")}
                    </p>
                  )}
                  <MediaDetailsForm
                    action={saveMediaDetails}
                    authorizations={authorizationOptions}
                    values={{
                      id: m.id,
                      isSvg: m.storagePath.endsWith(".svg"),
                      altIt: m.altIt,
                      altEn: m.altEn,
                      sourceType: m.sourceType,
                      author: m.author,
                      authorUrl: m.authorUrl,
                      license: m.license,
                      licenseUrl: m.licenseUrl,
                      sourceUrl: m.sourceUrl,
                      modified: m.modified,
                      heritageAsset: m.heritageAsset,
                      authorizationId: m.authorizationId,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
