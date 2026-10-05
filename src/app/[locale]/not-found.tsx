import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/design";

// 404 (schemi.md, stato vuoto: una frase che dice cosa fare e un'azione principale).
export default async function NotFound() {
  const t = await getTranslations("Errors");
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 md:px-8">
      <p className="text-label uppercase text-lava-muted">{t("notFoundEyebrow")}</p>
      <h1 className="is-display text-display-l">{t("notFoundTitle")}</h1>
      <p className="text-body-l text-pretty text-lava-muted">{t("notFoundText")}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <ButtonLink href="/itinerari" variant="primary">
          {t("toItineraries")}
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          {t("toHome")}
        </ButtonLink>
      </div>
    </section>
  );
}
