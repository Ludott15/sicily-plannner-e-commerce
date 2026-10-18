import "server-only";
import { cache } from "react";
import { publicNameOf } from "@/lib/seasons";
import { unreadNotificationsCount } from "@/server/notifications/queries";
import { getProfile, getUser } from "./index";

// Dati dell'utente per l'intestazione del sito (avatar, campanella, menu personale). Una sola
// esecuzione per richiesta grazie a cache(). Un ospite (sessione anonima) non riceve notifiche.
export type HeaderUser =
  | { kind: "anonymous" }
  | { kind: "guest" }
  | {
      kind: "member";
      displayName: string | null;
      avatarUrl: string | null;
      initials: string;
      unread: number;
    };

export const getHeaderUser = cache(async (): Promise<HeaderUser> => {
  const user = await getUser();
  if (user === null) return { kind: "anonymous" };
  if (user.is_anonymous === true) return { kind: "guest" };

  const [profile, unread] = await Promise.all([getProfile(user), unreadNotificationsCount(user)]);
  const name = publicNameOf(profile?.displayName ?? null, fullNameOf(user.user_metadata));
  return {
    kind: "member",
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    initials: initialsOf(name),
    unread,
  };
});

// Nome completo dai metadati dell'account (scritto alla registrazione), se presente.
function fullNameOf(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || !("full_name" in metadata)) return null;
  return typeof metadata.full_name === "string" ? metadata.full_name : null;
}

// Iniziali di un nome già abbreviato da publicNameOf ("M. R." -> "MR", "Giulia" -> "G"), al più due.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.replace(/\./g, ""))
    .filter((word) => word !== "")
    .map((word) => (Array.from(word)[0] ?? "").toUpperCase())
    .slice(0, 2)
    .join("");
}
