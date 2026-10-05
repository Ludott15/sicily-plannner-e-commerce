// Controlli di lancio sulla configurazione di Supabase Auth del progetto cloud, letta da
// GET <url>/auth/v1/settings (pubblico, con la chiave publishable). Li esegue l'e2e
// e2e/launch.spec.ts con PRE_LAUNCH=1; docs/LANCIO.md spiega come correggere ogni voce.
// Il CAPTCHA non compare in /settings: l'e2e lo verifica con una richiesta senza token.

export type AuthSettings = {
  external?: Record<string, boolean | undefined>;
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
};

export type LaunchProblem =
  | "mailer_autoconfirm" // "Confirm email" spento: un ospite salverebbe un'email senza codice
  | "anonymous_users" // accessi anonimi spenti: niente ospiti
  | "email_provider" // accesso via email spento
  | "signup_disabled"; // iscrizioni chiuse: nessun nuovo account né conversione da ospite

export function authSettingsProblems(settings: AuthSettings): LaunchProblem[] {
  const problems: LaunchProblem[] = [];
  if (settings.mailer_autoconfirm !== false) problems.push("mailer_autoconfirm");
  if (settings.external?.anonymous_users !== true) problems.push("anonymous_users");
  if (settings.external?.email !== true) problems.push("email_provider");
  if (settings.disable_signup !== false) problems.push("signup_disabled");
  return problems;
}
