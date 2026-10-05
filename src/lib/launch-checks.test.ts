import { describe, expect, it } from "vitest";
import { authSettingsProblems } from "./launch-checks";

const ok = {
  external: { anonymous_users: true, email: true, google: true },
  disable_signup: false,
  mailer_autoconfirm: false,
};

describe("controlli di lancio su /auth/v1/settings", () => {
  it("configurazione giusta: nessun problema", () => {
    expect(authSettingsProblems(ok)).toEqual([]);
  });

  it("Confirm email spento (mailer_autoconfirm true o assente): problema", () => {
    expect(authSettingsProblems({ ...ok, mailer_autoconfirm: true })).toEqual(["mailer_autoconfirm"]);
    expect(authSettingsProblems({ ...ok, mailer_autoconfirm: undefined })).toEqual(["mailer_autoconfirm"]);
  });

  it("accessi anonimi, email e iscrizioni", () => {
    expect(authSettingsProblems({ ...ok, external: { email: true } })).toEqual(["anonymous_users"]);
    expect(authSettingsProblems({ ...ok, external: { anonymous_users: true, email: false } })).toEqual(["email_provider"]);
    expect(authSettingsProblems({ ...ok, disable_signup: true })).toEqual(["signup_disabled"]);
  });

  it("risposta vuota o inattesa: tutti i problemi", () => {
    expect(authSettingsProblems({})).toEqual(["mailer_autoconfirm", "anonymous_users", "email_provider", "signup_disabled"]);
  });
});
