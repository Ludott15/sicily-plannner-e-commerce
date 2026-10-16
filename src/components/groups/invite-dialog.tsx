"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { FieldLabel, FormAlert, SavedNote, controlClass } from "@/components/trips/trip-ui";
import { Dialog } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import { createInviteLink, revokeInviteLink, sendEmailInvite } from "@/server/groups/actions";
import type { EmailInviteState, GroupFormState, InviteLinkState } from "@/server/groups/state";
import { useGroupAction } from "./use-group-action";

// Invito al gruppo, solo per l'owner (brief 6.1: azione primaria "Invita"). Il pulsante apre un
// Dialog con il link (crea, rigenera, copia, condividi, revoca) e l'invito per email. Il link
// completo si vede una sola volta, appena creato (il server salva solo l'hash del token): dopo si
// vedono scadenza e usi del link attivo. "Nuovo link" revoca il precedente lato server.
// Gli stati delle azioni stanno qui, nel componente sempre montato, e non nel Dialog: così il link
// creato resta visibile anche se il Dialog si chiude e si riapre.
export type ActiveLink = { expiresAt: string; uses: number; maxUses: number };

const IDLE_LINK: InviteLinkState = { status: "idle" };
const IDLE_GROUP: GroupFormState = { status: "idle" };
const IDLE_EMAIL: EmailInviteState = { status: "idle" };

export function InviteDialog({
  groupId,
  locale,
  activeLink,
}: {
  groupId: string;
  locale: string;
  activeLink: ActiveLink | null;
}) {
  const t = useTranslations("Groups");
  const format = useFormatter();
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  // Il link creato resta visibile finché non viene revocato: lo stato dell'esito lo ricorda.
  const [dismissed, setDismissed] = useState<InviteLinkState | null>(null);

  const createLink = useGroupAction<{ groupId: string; locale: string }, InviteLinkState>(createInviteLink, IDLE_LINK);
  const revoke = useGroupAction<{ groupId: string }, GroupFormState>(revokeInviteLink, IDLE_GROUP);
  const sendEmail = useGroupAction<{ groupId: string; email: string; locale: string }, EmailInviteState>(
    sendEmailInvite,
    IDLE_EMAIL,
  );

  useEffect(() => {
    if (createLink.state.status === "created" || revoke.state.status === "ok") router.refresh();
  }, [createLink.state, revoke.state, router]);

  const url =
    createLink.state.status === "created" && createLink.state !== dismissed ? createLink.state.url : null;
  const hasLink = url !== null || activeLink !== null;
  const linkError = createLink.state.status === "error" ? t(`errors.${createLink.state.code}`) : null;
  const revokeError = revoke.state.status === "error" ? t(`errors.${revoke.state.code}`) : null;
  const emailError = sendEmail.state.status === "error" ? t(`errors.${sendEmail.state.code}`) : null;
  const sentNote = sendEmail.state.status === "sent" ? t("emailSent") : null;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share(link: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: t("shareTitle"), url: link });
      } catch {
        // Condivisione annullata: nessun messaggio.
      }
      return;
    }
    await copy(link);
  }

  function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    sendEmail.run({ groupId, email: trimmed, locale });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("inviteHeading")}
      </Button>

      <Dialog open={open} title={t("v2.inviteTitle")} description={t("inviteIntro")} onClose={() => setOpen(false)}>
        <div aria-busy={createLink.pending || revoke.pending} className="flex flex-col gap-4">
          {url ? (
            <div className="flex flex-col gap-3">
              <FieldLabel htmlFor={`${id}-url`}>{t("linkLabel")}</FieldLabel>
              <input
                id={`${id}-url`}
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className={controlClass}
              />
              <p className="text-body-s text-lava-muted">{t("linkOnce")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void copy(url);
                  }}
                >
                  {copied ? t("copied") : t("copy")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void share(url);
                  }}
                >
                  {t("share")}
                </Button>
              </div>
            </div>
          ) : activeLink ? (
            <p className="text-body text-lava-muted">
              {t("linkActive", {
                date: format.dateTime(new Date(activeLink.expiresAt), { dateStyle: "long" }),
                uses: activeLink.uses,
                maxUses: activeLink.maxUses,
              })}
            </p>
          ) : (
            <p className="text-body text-lava-muted">{t("linkNone")}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={createLink.pending}
              onClick={() => createLink.run({ groupId, locale })}
            >
              {hasLink ? t("linkNew") : t("linkCreate")}
            </Button>
            {hasLink && (
              <Button
                variant="ghost"
                disabled={revoke.pending}
                onClick={() => {
                  setDismissed(createLink.state);
                  setCopied(false);
                  revoke.run({ groupId });
                }}
              >
                {t("linkRevoke")}
              </Button>
            )}
          </div>
          <FormAlert message={linkError} />
          <FormAlert message={revokeError} />

          <div className="flex flex-col gap-3 border-t border-divider pt-4">
            <h3 className="text-body font-semibold">{t("emailHeading")}</h3>
            <form onSubmit={onEmailSubmit} className="flex flex-col gap-3" aria-busy={sendEmail.pending}>
              <FieldLabel htmlFor={`${id}-email`}>{t("emailLabel")}</FieldLabel>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={emailError !== null}
                className={controlClass}
              />
              <div>
                <Button type="submit" variant="secondary" disabled={sendEmail.pending || email.trim().length === 0}>
                  {sendEmail.pending ? t("emailSending") : t("emailAction")}
                </Button>
              </div>
              <SavedNote message={sentNote} />
              <FormAlert message={emailError} />
            </form>
          </div>
        </div>
      </Dialog>
    </>
  );
}
