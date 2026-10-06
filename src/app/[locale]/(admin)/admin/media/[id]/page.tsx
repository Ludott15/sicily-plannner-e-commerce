import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { FocalPointPicker } from "@/components/admin/media/focal-point-picker";
import { MediaDetailsForm } from "@/components/admin/media/media-details-form";
import { DeleteMediaButton, MediaCoverForm } from "@/components/admin/media/media-cover-form";
import { Button } from "@/components/design";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { CoverCaption } from "@/components/catalog/cover-figure";
import { Link } from "@/lib/i18n/navigation";
import { mediaUrl, type Ratio } from "@/lib/media";
import {
  deleteMedia,
  removeMediaCover,
  saveMediaDetails,
  setMediaCover,
  setMediaFocalPoint,
} from "@/server/media/admin-actions.admin";
import { getAdminMedia, listAuthorizations, mediaProblems } from "@/server/media/admin-queries.admin";

// Scheda di un'immagine: punto focale (clic sull'originale), anteprima dei tre ritagli con
// la didascalia, dati, copertine che la usano, eliminazione.
const RATIOS: ReadonlyArray<[Ratio, string]> = [
  ["4x5", "aspect-[4/5] w-40"],
  ["16x9", "aspect-video w-72"],
  ["1x1", "aspect-square w-40"],
];

const ENTITY_PATH = { place: "/admin/luoghi", activity: "/admin/attivita", itinerary: "/admin/itinerari", area: null } as const;

export default async function AdminMediaDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, m, authorizations] = await Promise.all([getTranslations("Admin"), getAdminMedia(id), listAuthorizations()]);
  if (!m) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const problems = mediaProblems(m, today);
  const isSvg = m.storagePath.endsWith(".svg");

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{m.originalFilename ?? t("media")}</h1>
        <Link href="/admin/media" className="text-body">
          {t("backToList")}
        </Link>
      </div>
      <p className="text-body-s text-lava-muted">
        {m.width}×{m.height} · {m.creditText}
        {m.accessedAt && ` · ${t("mediaAccessedAt", { date: m.accessedAt })}`}
      </p>
      {problems.length > 0 && (
        <p className="text-body font-semibold text-danger">
          {t("mediaBlocked")}: {problems.map((p) => t(`mediaProblem.${p}`)).join(" · ")}
        </p>
      )}

      {!isSvg && (
        <section aria-labelledby="punto-focale" className="flex flex-col gap-4">
          <h2 id="punto-focale" className="is-display text-heading-2">
            {t("mediaFocal")}
          </h2>
          <p className="text-body-s text-lava-muted">{t("mediaFocalHint")}</p>
          <FocalPointPicker
            mediaId={m.id}
            src={mediaUrl(m.storagePath)}
            width={m.width}
            height={m.height}
            focalX={m.focalX}
            focalY={m.focalY}
            save={setMediaFocalPoint}
          />
          <div className="flex flex-wrap items-end gap-4" data-testid="media-variants">
            {RATIOS.map(([ratio, frame]) => (
              <figure key={ratio} className="flex flex-col gap-1">
                <div className={`relative overflow-hidden rounded-md bg-calce-sunk ${frame}`}>
                  <CoverPicture cover={m} ratio={ratio} sizes="288px" locale={locale} />
                </div>
                <figcaption className="text-caption text-lava-muted">{ratio.replace("x", ":")}</figcaption>
              </figure>
            ))}
          </div>
          <figure>
            <CoverCaption cover={m} />
          </figure>
        </section>
      )}

      <section aria-labelledby="dati" className="flex flex-col gap-4">
        <h2 id="dati" className="is-display text-heading-2">
          {t("mediaDetails")}
        </h2>
        <MediaDetailsForm
          action={saveMediaDetails}
          authorizations={authorizations.map((a) => ({
            id: a.id,
            label: `${a.authority} · ${a.reference} · ${a.validUntil}`,
            expired: a.validUntil < today,
          }))}
          values={{
            id: m.id,
            isSvg,
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
      </section>

      <section aria-labelledby="copertine" className="flex flex-col gap-4">
        <h2 id="copertine" className="is-display text-heading-2">
          {t("mediaCovers")}
        </h2>
        {m.usedBy.length === 0 ? (
          <p className="text-body text-lava-muted">{t("mediaUnused")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {m.usedBy.map((u) => {
              const base = ENTITY_PATH[u.type as keyof typeof ENTITY_PATH];
              return (
                <li key={`${u.type}-${u.id}`} className="flex flex-wrap items-center gap-4 text-body">
                  <span>
                    {t(`entity.${u.type}`)}: {base ? <Link href={`${base}/${u.id}`}>{u.name}</Link> : u.name}
                  </span>
                  <form action={removeMediaCover}>
                    <input type="hidden" name="type" value={u.type} />
                    <input type="hidden" name="id" value={u.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("mediaRemoveCover")}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <MediaCoverForm mediaId={m.id} action={setMediaCover} />
      </section>

      <div>
        <DeleteMediaButton mediaId={m.id} action={deleteMedia} />
      </div>
    </section>
  );
}
