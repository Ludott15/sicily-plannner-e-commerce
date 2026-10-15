import { describe, expect, it } from "vitest";
import { matchCode, parseJsonbPayload, pgErrorMessage } from "./pg";

const CODES = ["not_allowed", "guest_not_allowed", "too_far", "already_checked_in"] as const;

describe("mappatura degli errori di dominio", () => {
  it("riconosce il codice esatto", () => {
    expect(matchCode("too_far", CODES)).toBe("too_far");
  });

  it("non confonde not_allowed con guest_not_allowed", () => {
    expect(matchCode("guest_not_allowed", CODES)).toBe("guest_not_allowed");
    expect(matchCode("not_allowed", CODES)).toBe("not_allowed");
  });

  it("riconosce il codice dentro un messaggio più lungo", () => {
    expect(matchCode("ERROR: already_checked_in (P0001)", CODES)).toBe("already_checked_in");
  });

  it("restituisce null per un messaggio sconosciuto", () => {
    expect(matchCode("connection refused", CODES)).toBeNull();
  });

  it("legge il messaggio della causa, non quello del wrapper con i parametri", () => {
    const error = Object.assign(new Error("Failed query: select ... params: 37.79,14.83"), {
      cause: { message: "too_far" },
    });
    expect(pgErrorMessage(error)).toBe("too_far");
  });

  it("usa il messaggio dell'errore se manca la causa", () => {
    expect(pgErrorMessage(new Error("daily_limit"))).toBe("daily_limit");
    expect(pgErrorMessage("text")).toBe("");
  });

  it("decodifica il jsonb quando arriva come testo", () => {
    expect(parseJsonbPayload('{"points":10}')).toEqual({ points: 10 });
    expect(parseJsonbPayload("non json")).toBeNull();
    expect(parseJsonbPayload({ points: 10 })).toEqual({ points: 10 });
  });
});
