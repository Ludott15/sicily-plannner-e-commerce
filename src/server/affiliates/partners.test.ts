import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { partnerIdFromEnv, PARTNER_ID_ENV_NAMES } from "./partners";

// Prova a rovescio permanente: una variabile d'ambiente qualsiasi (segreti compresi) non diventa mai
// un ID partner, anche se è impostata. Solo i nomi di PARTNER_ID_ENV_NAMES si leggono.

const KEYS = [
  "BOOKING_AFFILIATE_ID",
  "FERRYHOPPER_AFFILIATE_ID",
  "AFFILIATE_LINK_SECRET",
  "RATE_LIMIT_SECRET",
  "FLIGHT_LINK_SECRET",
  "CRON_SECRET",
  "DATABASE_URL",
] as const;

const snapshot: Partial<Record<string, string>> = {};

beforeEach(() => {
  for (const key of KEYS) snapshot[key] = process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("partnerIdFromEnv", () => {
  it("segreti e altre variabili non diventano mai un ID partner, anche se impostate", () => {
    process.env.AFFILIATE_LINK_SECRET = "segreto-di-test-non-usare";
    process.env.RATE_LIMIT_SECRET = "rate-segreto-di-test";
    process.env.FLIGHT_LINK_SECRET = "flight-segreto-di-test";
    process.env.CRON_SECRET = "cron-segreto-di-test";
    process.env.DATABASE_URL = "postgres://utente:pwd@localhost:5432/db";

    expect(partnerIdFromEnv("AFFILIATE_LINK_SECRET")).toBeNull();
    expect(partnerIdFromEnv("RATE_LIMIT_SECRET")).toBeNull();
    expect(partnerIdFromEnv("FLIGHT_LINK_SECRET")).toBeNull();
    expect(partnerIdFromEnv("CRON_SECRET")).toBeNull();
    expect(partnerIdFromEnv("DATABASE_URL")).toBeNull();
  });

  it("un nome della lista con un valore valido restituisce il valore, senza spazi", () => {
    process.env.BOOKING_AFFILIATE_ID = "  12345-abc  ";
    expect(partnerIdFromEnv("BOOKING_AFFILIATE_ID")).toBe("12345-abc");
  });

  it("nome nullo, variabile mancante o valore non ammesso: null", () => {
    delete process.env.BOOKING_AFFILIATE_ID;
    expect(partnerIdFromEnv(null)).toBeNull();
    expect(partnerIdFromEnv("BOOKING_AFFILIATE_ID")).toBeNull();

    process.env.BOOKING_AFFILIATE_ID = "id con spazi; e punto e virgola";
    expect(partnerIdFromEnv("BOOKING_AFFILIATE_ID")).toBeNull();
  });

  it("la lista contiene i partner previsti e non i segreti", () => {
    expect(PARTNER_ID_ENV_NAMES).toContain("BOOKING_AFFILIATE_ID");
    expect(PARTNER_ID_ENV_NAMES).toContain("FERRYHOPPER_AFFILIATE_ID");
    expect(PARTNER_ID_ENV_NAMES).toContain("RADICALSTORAGE_AFFILIATE_ID");
    expect(PARTNER_ID_ENV_NAMES).not.toContain("AFFILIATE_LINK_SECRET");
    expect(PARTNER_ID_ENV_NAMES).not.toContain("RATE_LIMIT_SECRET");
    expect(PARTNER_ID_ENV_NAMES.every((name) => /^[A-Z][A-Z0-9_]*_(AFFILIATE_ID|PARTNER_ID|AGENCY_ID|MARKER)$/.test(name))).toBe(true);
  });

  it("senza ID il nome del partner dà null (link senza parametro, non errore)", () => {
    delete process.env.FERRYHOPPER_AFFILIATE_ID;
    expect(partnerIdFromEnv("FERRYHOPPER_AFFILIATE_ID")).toBeNull();
  });
});
