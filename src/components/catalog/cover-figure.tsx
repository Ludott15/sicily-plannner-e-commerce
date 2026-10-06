import { useTranslations } from "next-intl";
import type { CoverMedia, Ratio, ResolvedCover } from "@/lib/media";
import { CoverPicture } from "./cover-picture";

// Didascalia sotto le immagini di pagina (docs/IMMAGINI.md): "Foto: autore, licenza" con i
// link, più "modificata" se la foto è stata ritagliata o ridotta; le illustrazioni dicono
// "Illustrazione di Isula".
export function CoverCaption({ cover, className }: { cover: CoverMedia; className?: string }) {
  const t = useTranslations("Media");
  if (cover.kind === "illustration") {
    return <figcaption className={["text-caption text-lava-muted", className].filter(Boolean).join(" ")}>{t("illustrationCredit")}</figcaption>;
  }
  const link = (text: string, href: string | null) =>
    href ? (
      <a href={href} rel="nofollow noopener noreferrer" target="_blank" className="underline">
        {text}
      </a>
    ) : (
      text
    );
  return (
    <figcaption className={["text-caption text-lava-muted", className].filter(Boolean).join(" ")}>
      {t("photoCredit")} {link(cover.author ?? "", cover.authorUrl)}
      {cover.license && <>, {link(cover.license, cover.licenseUrl)}</>}
      {cover.modified && <> · {t("modified")}</>}
    </figcaption>
  );
}

// Immagine di pagina con didascalia. Senza nessun anello della catena: segnaposto
// calce-sunk con il nome (manuale, Fotografia), senza didascalia.
export function CoverFigure({
  cover,
  ratio,
  sizes,
  locale,
  placeholder,
  frameClassName,
  captionClassName,
  priority = false,
}: {
  cover: ResolvedCover;
  ratio: Ratio;
  sizes: string;
  locale: string;
  placeholder: string;
  frameClassName: string;
  captionClassName?: string;
  priority?: boolean;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className={`relative overflow-hidden bg-calce-sunk ${frameClassName}`}>
        {cover ? (
          <CoverPicture cover={cover.media} ratio={ratio} sizes={sizes} locale={locale} priority={priority} />
        ) : (
          <span className="is-display absolute bottom-4 left-4 text-heading-2 text-lava-muted" aria-hidden="true">
            {placeholder}
          </span>
        )}
      </div>
      {cover && <CoverCaption cover={cover.media} className={captionClassName} />}
    </figure>
  );
}
