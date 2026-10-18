import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link2 } from "lucide-react";
import { ButtonLink } from "@/components/design";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { AcceptInviteButton } from "@/components/groups/accept-invite-button";
import { MemberAvatar } from "@/components/groups/member-avatar";
import { getUser } from "@/server/auth";
import { getInvitePage } from "@/server/groups/queries";
import { getSavedPreferences } from "@/server/personalization/data";

// Invito al gruppo (BACKLOG: "Invito al gruppo dal lato di chi riceve il link"), riprogettato in 6.1:
// una card centrata con l'anteprima del viaggio, chi invita e una sola azione. Pubblica: l'anteprima
// si vede senza account, e il token non si indicizza (noindex). Un token scaduto, revocato, esaurito
// o inesistente dà un messaggio chiaro in una card a sé, senza dati del gruppo.
// Chi entra: non loggato → accesso con codice; ospite → account con la sua email (un ospite
// non entra nei gruppi); loggato senza gusti → prima i gusti; loggato → "Entra nel gruppo".
type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "GroupInvite" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function InvitePage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [invite, user, t, format] = await Promise.all([
    getInvitePage(token),
    getUser(),
    getTranslations("GroupInvite"),
    getFormatter(),
  ]);

  if (invite.status !== "active") {
    return (
      <section className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-8 md:py-16">
        <article className="flex flex-col items-start gap-6 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card md:p-8">
          <span className="grid size-12 place-items-center rounded-pill bg-calce-sunk text-lava-muted">
            <Link2 size={22} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-3">
            <h1 className="is-display text-heading-1 text-balance">{t("unavailableTitle")}</h1>
            <p className="text-body text-lava-muted">{t(`status.${invite.status}`)}</p>
          </div>
          <ButtonLink href="/" variant="secondary">
            {t("home")}
          </ButtonLink>
        </article>
      </section>
    );
  }

  const { preview } = invite;
  const invitePath = `/${locale}/invito/${token}`;
  const saved = user && !user.is_anonymous ? await getSavedPreferences(user) : null;
  const tastesDone = saved?.completed === true;
  const ownerName = preview.ownerName ?? t("someone");
  const facts = [
    preview.itineraryDays ? t("days", { count: preview.itineraryDays }) : null,
    t("expires", { date: format.dateTime(new Date(preview.expiresAt), { dateStyle: "long" }) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-8 md:py-16">
      <article className="flex flex-col gap-6 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card md:p-8">
        <header className="flex flex-col gap-4">
          <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
          <h1 className="is-display text-heading-1 text-balance">{preview.itineraryTitle ?? preview.groupName}</h1>
          <div className="flex items-center gap-3">
            <MemberAvatar name={preview.ownerName} avatarUrl={preview.ownerAvatarUrl} />
            <p className="text-body">{t("groupLine", { owner: ownerName, name: preview.groupName })}</p>
          </div>
          <p className="text-body-s text-lava-muted">{facts}</p>
        </header>

        <section aria-labelledby="invite-stops" className="flex flex-col gap-3 border-t border-divider pt-6">
          <h2 id="invite-stops" className="text-heading-3">
            {t("stopsHeading")}
          </h2>
          {preview.stops.length > 0 ? (
            <ol className="flex flex-col gap-2 text-body">
              {preview.stops.map((stop, index) => (
                <li key={`${stop}-${index}`}>{stop}</li>
              ))}
            </ol>
          ) : (
            <p className="text-body-s text-lava-muted">{t("stopsEmpty")}</p>
          )}
        </section>

        <section aria-labelledby="invite-action" className="flex flex-col gap-4 border-t border-divider pt-6">
          <h2 id="invite-action" className="sr-only">
            {t("actionHeading")}
          </h2>
          {!user ? (
            <>
              <p className="text-body text-lava-muted">{t("signInHint")}</p>
              <div>
                <ButtonLink href={{ pathname: "/login", query: { next: invitePath } }} variant="primary">
                  {t("signIn")}
                </ButtonLink>
              </div>
            </>
          ) : user.is_anonymous ? (
            <>
              <p className="text-body text-lava-muted">{t("guestNeedsAccount")}</p>
              <EmailCodeForm mode="guest" locale={locale} next={invitePath} />
            </>
          ) : !tastesDone ? (
            <>
              <p className="text-body text-lava-muted">{t("tastesFirst")}</p>
              <div>
                <ButtonLink href={{ pathname: "/viaggio/nuovo", query: { next: invitePath } }} variant="primary">
                  {t("tastesAction")}
                </ButtonLink>
              </div>
            </>
          ) : (
            <AcceptInviteButton token={token} locale={locale} />
          )}
        </section>
      </article>
    </section>
  );
}
