import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { GROUP_NAME_MAX_LENGTH } from "./state";

// Validazione degli input delle azioni dei gruppi (Zod prima di qualsiasi accesso al database).
// Il token dell'invito è base64url di 32 byte: 43 caratteri.

export const localeSchema = z.enum(routing.locales);

export const groupIdSchema = z.uuid();

export const groupNameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH);

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// Email normalizzata (spazi e maiuscole) e poi validata.
export const inviteEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const createGroupSchema = z.object({
  itineraryId: z.uuid(),
  name: groupNameSchema,
  locale: localeSchema,
});

export const renameGroupSchema = z.object({
  groupId: groupIdSchema,
  name: groupNameSchema,
});

export const groupLocaleSchema = z.object({
  groupId: groupIdSchema,
  locale: localeSchema,
});

export const groupOnlySchema = z.object({
  groupId: groupIdSchema,
});

export const sendEmailInviteSchema = z.object({
  groupId: groupIdSchema,
  email: inviteEmailSchema,
  locale: localeSchema,
});

export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
  locale: localeSchema,
});

export const memberSchema = z.object({
  groupId: groupIdSchema,
  userId: z.uuid(),
});
