import { describe, expect, it } from "vitest";
import { fillLegalVariables, LEGAL_VARIABLES, MISSING_VALUE, shippingText } from "./legal-text";
import type { LegalEntity } from "./legal-entity";
import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_CENTS } from "./shop/config";

const entity: LegalEntity = {
  name: "Mario Rossi",
  address: "Via Roma 1, Palermo",
  vatNumber: "12345678901",
  privacyEmail: "privacy@example.com",
  supportEmail: "assistenza@example.com",
};

describe("fillLegalVariables", () => {
  it("sostituisce ogni variabile con il dato del titolare", () => {
    const text = "{{titolare}}, {{sede}}, P.IVA {{partita_iva}}, {{email_privacy}}, {{email_assistenza}}";
    expect(fillLegalVariables(text, entity, "it")).toBe(
      "Mario Rossi, Via Roma 1, Palermo, P.IVA 12345678901, privacy@example.com, assistenza@example.com",
    );
  });

  it("accetta spazi dentro le graffe", () => {
    expect(fillLegalVariables("{{ titolare }}", entity, "it")).toBe("Mario Rossi");
  });

  it("con il titolare mancante mostra il trattino, mai il segnaposto", () => {
    const filled = fillLegalVariables("{{titolare}} {{sede}} {{partita_iva}} {{email_privacy}} {{email_assistenza}}", null, "it");
    expect(filled).toBe([MISSING_VALUE, MISSING_VALUE, MISSING_VALUE, MISSING_VALUE, MISSING_VALUE].join(" "));
    expect(filled).not.toContain("{{");
  });

  it("riempie la spedizione dalla configurazione dello shop, anche senza titolare", () => {
    const filled = fillLegalVariables("{{spedizione_testo}}", null, "it");
    expect(filled).toBe(shippingText("it"));
    expect(filled).not.toContain("{{");
    expect(FREE_SHIPPING_THRESHOLD_CENTS).toBeGreaterThan(SHIPPING_FLAT_CENTS);
  });

  it("lascia intatto un nome sconosciuto", () => {
    expect(fillLegalVariables("{{nome_inventato}} e basta", entity, "it")).toBe("{{nome_inventato}} e basta");
  });

  it("conosce le variabili dichiarate", () => {
    expect(LEGAL_VARIABLES).toEqual([
      "titolare",
      "sede",
      "partita_iva",
      "email_privacy",
      "email_assistenza",
      "spedizione_testo",
    ]);
  });
});
