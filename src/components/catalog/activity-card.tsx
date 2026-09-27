import { getTranslations } from "next-intl/server";
import { formatDuration, formatEur } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import type { ActivityCard as ActivityCardData } from "@/server/catalog/queries";
import { TagList } from "./tag-list";

export async function ActivityCard({
  activity,
  locale,
  interestLabels,
}: {
  activity: ActivityCardData;
  locale: string;
  interestLabels: Map<string, string>;
}) {
  const t = await getTranslations("Catalog");
  const price = formatEur(activity.priceFromEur, locale);

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <h3 className="font-medium leading-snug">
        <Link href={`/attivita/${activity.slug}`} className="hover:underline">
          {activity.title}
        </Link>
      </h3>
      <p className="text-sm text-muted-foreground">
        <Link href={`/luoghi/${activity.placeSlug}`} className="hover:underline">
          {activity.placeName}
        </Link>
        {" · "}
        {formatDuration(activity.durationMin)}
        {price !== null && ` · ${Number(activity.priceFromEur) === 0 ? t("free") : t("priceFrom", { price })}`}
      </p>
      <TagList tags={activity.tags} labels={interestLabels} />
    </li>
  );
}
