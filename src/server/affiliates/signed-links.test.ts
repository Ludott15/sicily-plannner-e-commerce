import { describe, expect, it } from "vitest";
import { canonicalFields, signFields, verifyFields } from "./signed-links";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = 1_800_000_000;
const FIELDS = ["v", "booking", "lodging", "Taormina", "", "2026-11-03", "2026-11-05", "2", "page", "", String(NOW + 60)];

describe("canonicalFields", () => {
  it("unisce i campi con | e tratta il campo assente come stringa vuota", () => {
    expect(canonicalFields(["a", "", "c"])).toBe("a||c");
  });

  it("rifiuta il separatore e i caratteri di controllo nei campi", () => {
    expect(() => canonicalFields(["a|b"])).toThrow();
    expect(() => canonicalFields(["a\nb"])).toThrow();
    expect(() => canonicalFields(["a\u0000b"])).toThrow();
  });
});

describe("signFields / verifyFields", () => {
  it("firma valida e non scaduta: ok; la firma è deterministica e in base64url a 43 caratteri", () => {
    const signature = signFields(FIELDS, SECRET);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signFields(FIELDS, SECRET)).toBe(signature);
    expect(verifyFields(FIELDS, signature, SECRET, NOW + 60, NOW)).toBe("ok");
  });

  it("prova a rovescio: un campo cambiato invalida la firma", () => {
    const signature = signFields(FIELDS, SECRET);
    const tampered = [...FIELDS];
    tampered[2] = "car";
    expect(verifyFields(tampered, signature, SECRET, NOW + 60, NOW)).toBe("invalid_signature");
    const other = [...FIELDS];
    other[3] = "Palermo";
    expect(verifyFields(other, signature, SECRET, NOW + 60, NOW)).toBe("invalid_signature");
  });

  it("prova a rovescio: un valore con | non può imitare due campi", () => {
    const signature = signFields(["a", "b"], SECRET);
    expect(() => verifyFields(["a|b"], signature, SECRET, NOW + 60, NOW)).not.toThrow();
    expect(verifyFields(["a|b"], signature, SECRET, NOW + 60, NOW)).toBe("invalid_signature");
  });

  it("firma di lunghezza sbagliata o vuota: invalid_signature senza eccezioni", () => {
    expect(verifyFields(FIELDS, "", SECRET, NOW + 60, NOW)).toBe("invalid_signature");
    expect(verifyFields(FIELDS, "abc", SECRET, NOW + 60, NOW)).toBe("invalid_signature");
  });

  it("chiave diversa: invalid_signature", () => {
    const signature = signFields(FIELDS, SECRET);
    expect(verifyFields(FIELDS, signature, "altra-chiave", NOW + 60, NOW)).toBe("invalid_signature");
  });

  it("scadenza: expired quando expiresAt <= ora, dopo il controllo della firma", () => {
    const signature = signFields(FIELDS, SECRET);
    expect(verifyFields(FIELDS, signature, SECRET, NOW, NOW)).toBe("expired");
    expect(verifyFields(FIELDS, signature, SECRET, NOW - 1, NOW)).toBe("expired");
    const wrong = [...FIELDS];
    wrong[10] = String(NOW + 86_400 * 30);
    expect(verifyFields(wrong, signature, SECRET, NOW + 86_400 * 30, NOW)).toBe("invalid_signature");
  });

  it("senza segreto: missing_secret e nessuna firma con chiave vuota", () => {
    expect(verifyFields(FIELDS, "anything", undefined, NOW + 60, NOW)).toBe("missing_secret");
    expect(verifyFields(FIELDS, "anything", "", NOW + 60, NOW)).toBe("missing_secret");
    expect(() => signFields(FIELDS, undefined)).toThrow();
    expect(() => signFields(FIELDS, "")).toThrow();
  });
});
