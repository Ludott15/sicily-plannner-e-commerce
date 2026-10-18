import { describe, expect, it } from "vitest";
import { legalEnvSchema, type LegalEnv } from "./legal-env";
import { legalEntityFrom, missingLegalEnv } from "./legal-entity";

const complete: LegalEnv = {
  NEXT_PUBLIC_LEGAL_NAME: "Mario Rossi",
  NEXT_PUBLIC_LEGAL_ADDRESS: "Via Roma 1, 90100 Palermo",
  NEXT_PUBLIC_LEGAL_VAT_NUMBER: "12345678901",
  NEXT_PUBLIC_PRIVACY_EMAIL: "privacy@example.com",
  NEXT_PUBLIC_SUPPORT_EMAIL: "assistenza@example.com",
};

describe("legalEntityFrom", () => {
  it("restituisce il titolare solo con tutte le voci", () => {
    expect(legalEntityFrom(complete)).toEqual({
      name: "Mario Rossi",
      address: "Via Roma 1, 90100 Palermo",
      vatNumber: "12345678901",
      privacyEmail: "privacy@example.com",
      supportEmail: "assistenza@example.com",
    });
  });

  it("restituisce null se manca anche una sola voce, e le elenca", () => {
    const partial: LegalEnv = { ...complete, NEXT_PUBLIC_LEGAL_VAT_NUMBER: undefined };
    expect(legalEntityFrom(partial)).toBeNull();
    expect(missingLegalEnv(partial)).toEqual(["NEXT_PUBLIC_LEGAL_VAT_NUMBER"]);
    expect(missingLegalEnv(complete)).toEqual([]);
  });

  it("restituisce null senza variabili", () => {
    expect(legalEntityFrom({})).toBeNull();
    expect(missingLegalEnv({})).toHaveLength(5);
  });
});

describe("legalEnvSchema", () => {
  it("accetta le variabili assenti e rifiuta una partita IVA non di 11 cifre o un'email non valida", () => {
    expect(legalEnvSchema.parse({ NEXT_PUBLIC_LEGAL_NAME: undefined }).NEXT_PUBLIC_LEGAL_NAME).toBeUndefined();
    expect(() => legalEnvSchema.parse({ NEXT_PUBLIC_LEGAL_VAT_NUMBER: "1234567890" })).toThrow();
    expect(() => legalEnvSchema.parse({ NEXT_PUBLIC_SUPPORT_EMAIL: "non-una-email" })).toThrow();
  });
});
