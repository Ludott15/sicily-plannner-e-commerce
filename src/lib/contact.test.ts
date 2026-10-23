import { describe, expect, it } from "vitest";
import { contactMessageSchema } from "./contact";

const valid = {
  name: "  Anna  ",
  email: " anna@example.com ",
  topic: "trip",
  message: "Vorrei sapere se l'itinerario di Noto è adatto a famiglie.",
  captchaToken: "token",
};

describe("contactMessageSchema", () => {
  it("accetta un messaggio valido e pulisce spazi e nome vuoto", () => {
    const parsed = contactMessageSchema.parse(valid);
    expect(parsed.name).toBe("Anna");
    expect(parsed.email).toBe("anna@example.com");
    expect(contactMessageSchema.parse({ ...valid, name: "   " }).name).toBeNull();
    expect(contactMessageSchema.parse({ ...valid, name: undefined }).name).toBeNull();
  });

  it("rifiuta un argomento fuori elenco e un messaggio troppo corto o troppo lungo", () => {
    expect(contactMessageSchema.safeParse({ ...valid, topic: "altro-argomento" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, message: "troppo corto" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, message: "a".repeat(3001) }).success).toBe(false);
  });

  it("rifiuta un'email non valida e l'assenza del token Turnstile", () => {
    expect(contactMessageSchema.safeParse({ ...valid, email: "non-una-email" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, captchaToken: "" }).success).toBe(false);
  });
});
