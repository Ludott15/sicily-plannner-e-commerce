import { legalEnv, type LegalEnv } from "./legal-env";

// Dati del titolare usati dai testi legali, dal contatto e dal footer. Vengono dall'ambiente
// (NEXT_PUBLIC_LEGAL_*, NEXT_PUBLIC_PRIVACY_EMAIL, NEXT_PUBLIC_SUPPORT_EMAIL): mai scritti nel
// codice. Finché anche solo una voce manca, il titolare è null e le pagine legali restano in
// preparazione (noindex, fuori dalla sitemap).

export type LegalEntity = {
  name: string;
  address: string;
  vatNumber: string;
  privacyEmail: string;
  supportEmail: string;
};

// Nomi delle variabili, nell'ordine in cui le controlla il controllo di lancio.
export const LEGAL_ENV_NAMES = [
  "NEXT_PUBLIC_LEGAL_NAME",
  "NEXT_PUBLIC_LEGAL_ADDRESS",
  "NEXT_PUBLIC_LEGAL_VAT_NUMBER",
  "NEXT_PUBLIC_PRIVACY_EMAIL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
] as const satisfies readonly (keyof LegalEnv)[];

export type LegalEnvName = (typeof LEGAL_ENV_NAMES)[number];

// Variabili mancanti in un ambiente già validato da legalEnvSchema. Pura: testabile senza process.env.
export function missingLegalEnv(env: LegalEnv): LegalEnvName[] {
  return LEGAL_ENV_NAMES.filter((name) => !env[name]);
}

// Il titolare completo, o null se manca anche una sola voce. Pura: testabile senza process.env.
export function legalEntityFrom(env: LegalEnv): LegalEntity | null {
  const name = env.NEXT_PUBLIC_LEGAL_NAME;
  const address = env.NEXT_PUBLIC_LEGAL_ADDRESS;
  const vatNumber = env.NEXT_PUBLIC_LEGAL_VAT_NUMBER;
  const privacyEmail = env.NEXT_PUBLIC_PRIVACY_EMAIL;
  const supportEmail = env.NEXT_PUBLIC_SUPPORT_EMAIL;
  if (!name || !address || !vatNumber || !privacyEmail || !supportEmail) return null;
  return { name, address, vatNumber, privacyEmail, supportEmail };
}

export function legalEntity(): LegalEntity | null {
  return legalEntityFrom(legalEnv);
}

// Le pagine legali sono pronte solo con il titolare completo.
export function isLegalReady(): boolean {
  return legalEntity() !== null;
}

// Email di assistenza mostrata nel sito (CONTACT_EMAIL in brand.ts). Indipendente dal resto:
// il contatto si può attivare anche prima che il titolare sia completo.
export function supportEmail(): string | null {
  return legalEnv.NEXT_PUBLIC_SUPPORT_EMAIL ?? null;
}
