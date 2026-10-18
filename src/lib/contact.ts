import { z } from "zod";

// Modulo di contatto (passo 8.3). Il messaggio va via email all'assistenza e non si salva nel
// database. Il nome è facoltativo; l'email serve per rispondere.

export const CONTACT_TOPICS = ["trip", "shop", "privacy", "content_report", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_MESSAGE_MIN_LENGTH = 20;
export const CONTACT_MESSAGE_MAX_LENGTH = 3000;

// Gli input arrivano dal client: li valida Zod prima di qualunque altra cosa (azione server).
export const contactMessageSchema = z.object({
  name: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((value) => (value ? value : null)),
  email: z.string().trim().max(254).pipe(z.email()),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(CONTACT_MESSAGE_MIN_LENGTH).max(CONTACT_MESSAGE_MAX_LENGTH),
  captchaToken: z.string().min(1).max(4096),
});

export type ContactMessageInput = z.input<typeof contactMessageSchema>;
export type ContactMessage = z.output<typeof contactMessageSchema>;
