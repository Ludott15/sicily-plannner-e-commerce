import { getTranslations, setRequestLocale } from "next-intl/server";
import { NEUTRAL } from "@/lib/onboarding";
import { Link } from "@/lib/i18n/navigation";
import { adminCatalogCoverage, adminPlacesWithoutArea } from "@/server/catalog/admin-queries.admin";
import { engineCatalog } from "@/server/personalization/data";
import { eligibleAreas, type Profile } from "@/server/personalization/engine";
import { adminImageCoverage, expiringAuthorizations } from "@/server/media/admin-queries.admin";

// Copertura del catalogo (M4 parte 3): per area, quante attività ci sono e quante hanno tag,
// offerta e consiglio locale, e se l'area è idonea per un viaggio di 3, 5 e 7 giorni.
// L'idoneità usa il profilo neutro (tutte le domande saltate: ritmo equilibrato, nessun
// vincolo), quindi è il caso più favorevole: con vincoli o ritmo diverso può cambiare.
const DAYS = [3, 5, 7] as const;

const neutral = (days: number): Profile => ({
  weights: {},
  budgetPerDayEur: null,
  car: null,
  reducedMobility: false,
  diet: [],
  pace: NEUTRAL.pace,
  days,
  months: [],
  airport: null,
});

export default async function CoveragePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows, catalog, noArea, images, expiring] = await Promise.all([
    getTranslations("Admin"),
    adminCatalogCoverage(),
    engineCatalog(),
    adminPlacesWithoutArea(),
    adminImageCoverage(),
    expiringAuthorizations(60),
  ]);
  const imageCell = (areaId: string | null, entity: "place" | "activity" | "itinerary") =>
    images.find((i) => i.areaId === areaId && i.entity === entity) ?? { photo: 0, fallback: 0, illustration: 0, none: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const eligible = new Map(DAYS.map((d) => [d, new Set(eligibleAreas(catalog, neutral(d)))]));
  const cell = "border-b border-divider px-3 py-2 text-right tabular-nums";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("coverageTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("coverageIntro")}</p>
      </div>
      <div className="flex flex-col gap-2" data-testid="places-without-area">
        <p className="text-body font-semibold">{t("coveragePlacesWithoutArea", { count: noArea.length })}</p>
        {noArea.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-s">
            {noArea.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/luoghi/${p.id}`}>{p.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-body-s">
          <thead>
            <tr className="text-label uppercase text-lava-muted">
              <th className="border-b border-divider px-3 py-2 text-left">{t("coverageArea")}</th>
              <th className="border-b border-divider px-3 py-2 text-right">{t("coverageActive")}</th>
              <th className="border-b border-divider px-3 py-2 text-right">{t("coverageTagged")}</th>
              <th className="border-b border-divider px-3 py-2 text-right">{t("coverageOffer")}</th>
              <th className="border-b border-divider px-3 py-2 text-right">{t("coverageTip")}</th>
              {DAYS.map((d) => (
                <th key={d} className="border-b border-divider px-3 py-2 text-right">
                  {t("coverageDays", { days: d })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.areaId ?? "none"} data-area={r.slug ?? "none"}>
                <th scope="row" className="border-b border-divider px-3 py-2 text-left font-semibold">
                  {r.areaId === null ? t("noArea") : locale === "en" ? r.nameEn : r.nameIt}
                </th>
                <td className={cell}>{r.active}</td>
                <td className={cell}>{t("coverageOf", { n: r.tagged, total: r.total })}</td>
                <td className={cell}>{r.withOffer}</td>
                <td className={cell}>{r.withTip}</td>
                {DAYS.map((d) => (
                  <td key={d} className={cell} data-days={d}>
                    {r.slug === null ? "—" : eligible.get(d)!.has(r.slug) ? t("coverageYes") : t("coverageNo")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="copertura-immagini" className="flex flex-col gap-4">
        <h2 id="copertura-immagini" className="is-display text-heading-2">
          {t("coverageImagesTitle")}
        </h2>
        <p className="max-w-2xl text-body-s text-lava-muted">{t("coverageImagesIntro")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-body-s" data-testid="image-coverage">
            <thead>
              <tr className="text-label uppercase text-lava-muted">
                <th className="border-b border-divider px-3 py-2 text-left">{t("coverageArea")}</th>
                {(["place", "activity", "itinerary"] as const).map((e) => (
                  <th key={e} className="border-b border-divider px-3 py-2 text-right">
                    {t(`entityPlural.${e}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.areaId ?? "none"} data-image-area={r.slug ?? "none"}>
                  <th scope="row" className="border-b border-divider px-3 py-2 text-left font-semibold">
                    {r.areaId === null ? t("noArea") : locale === "en" ? r.nameEn : r.nameIt}
                  </th>
                  {(["place", "activity", "itinerary"] as const).map((e) => {
                    const c = imageCell(r.areaId, e);
                    return (
                      <td key={e} className={cell} data-entity={e}>
                        {t("coverageImageCell", { photo: c.photo, fallback: c.fallback, illustration: c.illustration, none: c.none })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="autorizzazioni-in-scadenza" className="flex flex-col gap-3">
        <h2 id="autorizzazioni-in-scadenza" className="is-display text-heading-2">
          {t("coverageExpiringTitle")}
        </h2>
        {expiring.length === 0 ? (
          <p className="text-body text-lava-muted">{t("coverageExpiringEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body" data-testid="expiring-authorizations">
            {expiring.map((a) => (
              <li key={a.id}>
                <Link href="/admin/media/autorizzazioni">
                  {a.authority} · {a.reference}
                </Link>{" "}
                · {a.validUntil < today ? t("authorizationExpired") : t("authorizationValidUntil")} {a.validUntil} ·{" "}
                {t("authorizationMediaCount", { count: a.mediaCount })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
