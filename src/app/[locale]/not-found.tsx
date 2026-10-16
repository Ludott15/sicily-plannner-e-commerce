import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";

// 404 (schemi.md, stato vuoto: una frase che dice cosa fare e un'azione principale).
export default async function NotFound() {
  const t = await getTranslations("Errors");
  return (
    <PageContainer width="prose" className="flex-1 justify-center py-16 gap-4">
      <p className="text-label uppercase text-lava-muted">{t("notFoundEyebrow")}</p>
      <h1 className="is-display text-display-l">{t("notFoundTitle")}</h1>
      <p className="text-body-l text-pretty text-lava-muted">{t("notFoundText")}</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/itinerari" variant="primary">
          {t("toItineraries")}
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          {t("toHome")}
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
