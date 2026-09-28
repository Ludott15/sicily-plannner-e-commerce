import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

// Percorso di navigazione (mockup Attività: "Sicilia / Trapani / Riserva dello Zingaro").
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const t = useTranslations("Catalog");
  return (
    <nav aria-label={t("breadcrumbLabel")} className="text-body-s text-lava-muted">
      <ol className="flex flex-wrap gap-x-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-x-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="text-lava-muted no-underline hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
