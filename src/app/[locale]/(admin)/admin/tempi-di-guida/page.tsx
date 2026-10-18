import { getTranslations, setRequestLocale } from "next-intl/server";
import { DriveTimesForm, type DriveTimeRow } from "@/components/admin/drive-times-form";
import { orderPair } from "@/lib/drive-pairs";
import { listDriveTimes, saveDriveTimes, type DriveTimeArea } from "@/server/catalog/drive-times.admin";

// Tempi di guida tra aree (M4 parte 4): una riga per ogni coppia di aree, in ordine di "sort".
// Solo admin (il layout dell'area admin risponde 404 agli altri). Ogni salvataggio scrive
// admin_audit_log ("drive_times.update").
export default async function DriveTimesAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, data] = await Promise.all([getTranslations("AdminDriveTimes"), listDriveTimes()]);

  const minutesByPair = new Map(data.pairs.map((pair) => [`${pair.a}+${pair.b}`, pair.minutes]));
  const nameOf = (area: DriveTimeArea): string => (locale === "en" ? area.nameEn : area.nameIt);
  const rows: DriveTimeRow[] = [];
  for (let i = 0; i < data.areas.length; i++) {
    for (let j = i + 1; j < data.areas.length; j++) {
      const first = data.areas[i]!;
      const second = data.areas[j]!;
      const [a, b] = orderPair(first.id, second.id);
      rows.push({
        key: `${a}+${b}`,
        a,
        b,
        first: nameOf(first),
        second: nameOf(second),
        minutes: minutesByPair.get(`${a}+${b}`) ?? null,
      });
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>
      <DriveTimesForm action={saveDriveTimes} locale={locale} rows={rows} />
    </section>
  );
}
