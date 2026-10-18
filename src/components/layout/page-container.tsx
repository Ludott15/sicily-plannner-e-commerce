import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Contenitore di pagina (brief 6.1). Larghezze fisse: prose 680px per testo e liste, work 1120px per le
// pagine di lavoro, wide 1200px come il contenitore dell'intestazione. Lo spazio tra le sezioni è quello
// grande della scala (gap-10, gap-12 da md), lo stesso per tutte le pagine personali.
export type ContainerWidth = "prose" | "work" | "wide";

const WIDTHS: Record<ContainerWidth, string> = {
  prose: "max-w-[680px]",
  work: "max-w-[1120px]",
  wide: "max-w-[1200px]",
};

export function PageContainer({
  width = "prose",
  as: Tag = "section",
  className,
  children,
}: {
  width?: ContainerWidth;
  as?: "section" | "div" | "main";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("mx-auto flex w-full flex-col gap-10 px-4 py-8 md:gap-12 md:px-16 md:py-12", WIDTHS[width], className)}>
      {children}
    </Tag>
  );
}
