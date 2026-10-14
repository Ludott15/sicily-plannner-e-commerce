import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Field, Select } from "@/components/admin/fields";
import { Button, ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { verifyActivity } from "@/server/catalog/import-actions.admin";
import {
  adminListAreaOptions,
  adminListReviewQueue,
  type ReviewMissing,
} from "@/server/catalog/review-queries.admin";

// Parametri di URL ammessi per il filtro "manca" e il loro valore nella coda.
const MISSING_PARAMS = ["tag", "coordinate", "area", "foto"] as const;
const MISSING_BY_PARAM: Record<(typeof MISSING_PARAMS)[number], ReviewMissing> = {
  tag: "tags",
  coordinate: "coordinates",
  area: "area",
  foto: "photo",
};

// Valori non ammessi diventano "nessun filtro": la pagina non fallisce con un URL alterato.
const filterSchema = z.object({
  area: z.string().max(100).optional().catch(undefined),
  manca: z.enum(MISSING_PARAMS).optional().catch(undefined),
});

export default async function AdminReviewQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const parsed = filterSchema.safeParse(await searchParams);
  const raw: { area?: string; manca?: (typeof MISSING_PARAMS)[number] } = parsed.success ? parsed.data : {};

  const areas = await adminListAreaOptions();
  const areaSlug = raw.area && areas.some((a) => a.slug === raw.area) ? raw.area : null;
  const missing = raw.manca ? MISSING_BY_PARAM[raw.manca] : null;
  const [t, rows] = await Promise.all([getTranslations("Admin"), adminListReviewQueue({ areaSlug, missing })]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("reviewTitle")}</h1>
        <Link href="/admin/attivita" className="text-body">
          {t("backToList")}
        </Link>
      </div>
      <p className="max-w-2xl text-body text-lava-muted">{t("reviewIntro")}</p>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <Field label={t("reviewFilterArea")} htmlFor="area">
          <Select id="area" name="area" defaultValue={areaSlug ?? ""} className="min-w-56">
            <option value="">{t("reviewAllAreas")}</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("reviewFilterMissing")} htmlFor="manca">
          <Select id="manca" name="manca" defaultValue={raw.manca ?? ""} className="min-w-56">
            <option value="">{t("reviewAllMissing")}</option>
            {MISSING_PARAMS.map((param) => (
              <option key={param} value={param}>
                {t(`reviewMissing.${MISSING_BY_PARAM[param]}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          {t("reviewFilter")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body-l text-lava-muted">{t("reviewEmpty")}</p>
          <ButtonLink href="/admin/attivita/importa" variant="secondary">
            {t("reviewEmptyCta")}
          </ButtonLink>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={t("reviewTitle")} className="w-full text-left text-body">
            <thead className="text-body-s text-lava-muted">
              <tr className="border-b border-divider">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colTitle")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colPlace")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("fieldArea")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("reviewColMissing")}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t("colState")}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {t("reviewColActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-divider align-top">
                  <td className="py-3 pr-4 font-semibold">{row.title}</td>
                  <td className="py-3 pr-4">
                    <span>{row.placeName}</span>
                    {row.placeNeedsReview && (
                      <span className="block text-body-s font-semibold">{t("reviewPlaceNeedsReview")}</span>
                    )}
                    {!row.placeIsActive && <span className="block text-body-s font-semibold">{t("reviewPlaceInactive")}</span>}
                  </td>
                  <td className="py-3 pr-4">{row.areaName ?? t("noArea")}</td>
                  <td className="py-3 pr-4">
                    {row.missing.length === 0 ? (
                      <span className="text-lava-muted">{t("reviewNothingMissing")}</span>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {row.missing.map((item) => (
                          <li key={item} className="rounded-pill bg-calce-sunk px-3 py-1 text-body-s">
                            {t(`reviewMissing.${item}`)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3 pr-4">{row.isActive ? t("active") : t("inactive")}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <form action={verifyActivity}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          {t("reviewVerify")}
                        </Button>
                      </form>
                      <Link href={`/admin/attivita/${row.id}`} className="font-semibold">
                        {t("edit")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
