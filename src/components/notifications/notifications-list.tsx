"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/design";
import { dayOf, textOf } from "@/components/groups/payload";
import { Link } from "@/lib/i18n/navigation";
import { markNotificationsRead } from "@/server/notifications/actions";
import type { NotificationView } from "@/server/notifications/queries";

// Elenco delle notifiche (4.2). Le non lette si evidenziano; all'apertura della pagina sono tutte
// segnate come lette, una sola volta. Il testo viene dal tipo e dal payload, mai da una frase
// salvata nel database.

export function NotificationsList({ items }: { items: NotificationView[] }) {
  const t = useTranslations("Notifications");
  const [unreadIds] = useState<Set<string>>(() => new Set(items.filter((item) => item.readAt === null).map((item) => item.id)));
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || unreadIds.size === 0) return;
    marked.current = true;
    markNotificationsRead().catch(() => undefined);
  }, [unreadIds]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-body-l">{t("empty")}</p>
        <ButtonLink href="/viaggi" variant="secondary">
          {t("emptyAction")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const unread = unreadIds.has(item.id);
        const itineraryId = textOf(item.payload, "itineraryId", "");
        return (
          <li
            key={item.id}
            className={`flex flex-col gap-2 rounded-lg border bg-calce-raised p-4 ${unread ? "border-coccio" : "border-card-edge"}`}
          >
            {unread && <p className="text-label uppercase text-lava-muted">{t("new")}</p>}
            <NotificationText kind={item.kind} payload={item.payload} />
            {itineraryId !== "" && (
              <Link href={`/viaggi/${itineraryId}`} className="text-body-s font-semibold underline underline-offset-4">
                {t("openTrip")}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NotificationText({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const t = useTranslations("Notifications");
  const title = textOf(payload, "title", t("untitledStop"));
  const day = dayOf(payload, "day");

  if (kind === "proposal_accepted") return <p className="text-body">{t("proposalAccepted", { title, day })}</p>;
  if (kind === "proposal_rejected") return <p className="text-body">{t("proposalRejected", { title })}</p>;
  return <p className="text-body">{t("unknown")}</p>;
}
