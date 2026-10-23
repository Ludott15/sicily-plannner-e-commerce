import { z } from "zod";

// Dati del titolare per i testi legali e per il contatto (docs/LANCIO.md, "Dati del titolare").
// Variabili pubbliche (NEXT_PUBLIC_*), tutte facoltative: senza, la pagina legale mostra l'avviso
// "in preparazione" (legal-entity.ts). Un valore vuoto (o di soli spazi) vale come assente; un
// valore presente ma malformato fa fallire il caricamento, così l'errore si vede subito e non
// finisce nei testi pubblicati. Sta in un modulo a parte (non in env.ts) perché brand.ts lo usa
// e i test di env.ts ne sostituiscono l'export.

const legalText = (max: number) => z.string().trim().min(1).max(max).optional();
const legalEmail = z.email().max(254).optional();

export const legalEnvSchema = z.object({
  NEXT_PUBLIC_LEGAL_NAME: legalText(160),
  NEXT_PUBLIC_LEGAL_ADDRESS: legalText(300),
  // Partita IVA italiana: 11 cifre.
  NEXT_PUBLIC_LEGAL_VAT_NUMBER: z
    .string()
    .trim()
    .regex(/^\d{11}$/)
    .optional(),
  NEXT_PUBLIC_PRIVACY_EMAIL: legalEmail,
  NEXT_PUBLIC_SUPPORT_EMAIL: legalEmail,
});

export type LegalEnv = z.infer<typeof legalEnvSchema>;

const trimmedOrUndefined = (raw: string | undefined) => raw?.trim() || undefined;

export const legalEnv: LegalEnv = legalEnvSchema.parse({
  NEXT_PUBLIC_LEGAL_NAME: trimmedOrUndefined(process.env.NEXT_PUBLIC_LEGAL_NAME),
  NEXT_PUBLIC_LEGAL_ADDRESS: trimmedOrUndefined(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
  NEXT_PUBLIC_LEGAL_VAT_NUMBER: trimmedOrUndefined(process.env.NEXT_PUBLIC_LEGAL_VAT_NUMBER),
  NEXT_PUBLIC_PRIVACY_EMAIL: trimmedOrUndefined(process.env.NEXT_PUBLIC_PRIVACY_EMAIL),
  NEXT_PUBLIC_SUPPORT_EMAIL: trimmedOrUndefined(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
});
