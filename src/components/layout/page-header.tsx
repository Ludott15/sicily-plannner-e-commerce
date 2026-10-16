import type { ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";

// Intestazione di pagina (brief 6.1): eyebrow facoltativo, titolo (display), sottotitolo, riga dei fatti
// (meta), a destra l'azione primaria e il menu ⋯. Il percorso (breadcrumb) solo dove aiuta:
// in quel caso l'etichetta accessibile della navigazione è obbligatoria.
// Non è un componente interattivo: si usa anche dai Server Component.
export type Crumb = { label: string; href: string };

type BreadcrumbProps = { breadcrumb: Crumb[]; breadcrumbLabel: string } | { breadcrumb?: undefined; breadcrumbLabel?: undefined };

export type PageHeaderProps = BreadcrumbProps & {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  menu?: ReactNode;
};

export function PageHeader({ title, eyebrow, subtitle, meta, primaryAction, menu, breadcrumb, breadcrumbLabel }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label={breadcrumbLabel}>
          <ol className="flex flex-wrap items-center gap-2 text-body-s text-lava-muted">
            {breadcrumb.map((crumb, index) => (
              <li key={crumb.href} className="flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="text-lava-muted">
                    /
                  </span>
                )}
                <Link href={crumb.href} className="text-lava-muted no-underline hover:text-lava hover:underline">
                  {crumb.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-6 md:gap-y-4">
        <div className="flex min-w-0 flex-col gap-2 md:flex-1">
          {eyebrow && <p className="text-caption font-semibold tracking-[0.08em] text-coccio-text uppercase">{eyebrow}</p>}
          <h1 className="is-display text-heading-1 text-balance md:text-display-l">{title}</h1>
          {subtitle && <div className="max-w-[680px] text-body text-lava-muted">{subtitle}</div>}
          {meta && <div className="text-body-s text-lava-muted">{meta}</div>}
        </div>
        {(primaryAction || menu) && (
          <div className="flex items-center gap-2 md:shrink-0">
            {primaryAction && <div className="min-w-0 flex-1 md:flex-none [&>*]:w-full md:[&>*]:w-auto">{primaryAction}</div>}
            {menu}
          </div>
        )}
      </div>
    </header>
  );
}
