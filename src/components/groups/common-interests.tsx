import "server-only";
import { getTranslations } from "next-intl/server";
import type { requireUser } from "@/server/auth";
import { interestDomain } from "@/components/design";
import { commonInterests } from "@/lib/group-profile";
import { cn } from "@/lib/utils";
import { interestLabels } from "@/server/catalog/labels";
import { getGroupPreferences } from "@/server/groups/aggregate";

// "Interessi comuni" del gruppo: solo chiavi e un livello aggregato, mai per persona e mai con
// i nomi dei membri. Il chip è il design system (is-chip) ma non è cliccabile: qui non si
// seleziona nulla, quindi niente aria-pressed. Stati: caricamento (Suspense in pagina), errore,
// vuoto (nessun membro con preferenze), nessun interesse condiviso, lista.
type GroupUser = Awaited<ReturnType<typeof requireUser>>;

export async function CommonInterests({ user, groupId, locale }: { user: GroupUser; groupId: string; locale: string }) {
  const t = await getTranslations("Groups");
  const [labels, prefs] = await Promise.all([
    interestLabels(locale),
    getGroupPreferences(user, groupId).catch(() => null),
  ]);

  if (!prefs) {
    return (
      <section aria-labelledby="group-interests" className="flex flex-col gap-3">
        <h2 id="group-interests" className="text-heading-3">
          {t("interestsHeading")}
        </h2>
        <p role="alert" className="text-body text-lava-muted">
          {t("interestsFailed")}
        </p>
      </section>
    );
  }

  const common = commonInterests(prefs);

  return (
    <section aria-labelledby="group-interests" className="flex flex-col gap-3">
      <h2 id="group-interests" className="text-heading-3">
        {t("interestsHeading")}
      </h2>
      {prefs.withPreferences === 0 ? (
        <p className="text-body text-lava-muted">{t("commonEmpty")}</p>
      ) : prefs.private ? (
        <p className="text-body text-lava-muted">{t("commonPrivate")}</p>
      ) : common.length === 0 ? (
        <p className="text-body text-lava-muted">{t("commonNone")}</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {common.map((interest) => {
            const domain = interestDomain(interest.key);
            return (
              <li key={interest.key} className="flex items-center gap-2">
                <span className={cn("is-chip cursor-default", domain && `is-chip--${domain}`)}>
                  {labels.get(interest.key) ?? interest.key}
                </span>
                <span className="text-body-s text-lava-muted">
                  {interest.level === "high" ? t("commonHigh") : t("commonMedium")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
