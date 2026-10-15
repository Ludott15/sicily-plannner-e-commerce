import { describe, expect, it } from "vitest";
import { GroupActionError, groupErrorCodeOf } from "./errors";
import { createGroupSchema, inviteTokenSchema, sendEmailInviteSchema } from "./schemas";

// Errore di Postgres come lo espone postgres.js, avvolto come lo fa Drizzle (campo cause).
function dbError(code: string, message: string): unknown {
  return { message: "Failed query", cause: { code, message } };
}

describe("groupErrorCodeOf", () => {
  it.each([
    "guest_not_allowed",
    "itinerary_not_available",
    "invite_not_found",
    "invite_revoked",
    "invite_expired",
    "invite_exhausted",
    "already_member",
    "group_full",
    "not_group_owner",
    "not_group_member",
    "new_owner_not_member",
    "cannot_leave_as_owner",
    "cannot_remove_owner",
  ])("mappa il messaggio P0001 %s", (code) => {
    expect(groupErrorCodeOf(dbError("P0001", code))).toBe(code);
  });

  it("mappa la negazione della RLS (42501) su not_group_owner", () => {
    expect(groupErrorCodeOf(dbError("42501", "new row violates row-level security policy"))).toBe("not_group_owner");
  });

  it("risponde failed per un messaggio di dominio sconosciuto o un altro errore", () => {
    expect(groupErrorCodeOf(dbError("P0001", "qualcosa_di_nuovo"))).toBe("failed");
    expect(groupErrorCodeOf(dbError("23505", "duplicate key"))).toBe("failed");
    expect(groupErrorCodeOf(new Error("rete"))).toBe("failed");
    expect(groupErrorCodeOf(undefined)).toBe("failed");
  });

  it("legge il codice dell'errore lanciato dall'app", () => {
    expect(groupErrorCodeOf(new GroupActionError("email_unavailable"))).toBe("email_unavailable");
  });
});

describe("schemi dei gruppi", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("il nome del gruppo va da 1 a 60 caratteri, senza spazi ai bordi", () => {
    const ok = createGroupSchema.safeParse({ itineraryId: uuid, name: "  Sicilia  ", locale: "it" });
    expect(ok.success && ok.data.name).toBe("Sicilia");
    expect(createGroupSchema.safeParse({ itineraryId: uuid, name: "   ", locale: "it" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ itineraryId: uuid, name: "a".repeat(61), locale: "it" }).success).toBe(false);
  });

  it("il token dell'invito è di 43 caratteri base64url", () => {
    expect(inviteTokenSchema.safeParse("a".repeat(43)).success).toBe(true);
    expect(inviteTokenSchema.safeParse("a".repeat(42)).success).toBe(false);
    expect(inviteTokenSchema.safeParse(`${"a".repeat(42)}+`).success).toBe(false);
  });

  it("l'email d'invito è normalizzata e validata", () => {
    const ok = sendEmailInviteSchema.safeParse({ groupId: uuid, email: " Amico@Example.COM ", locale: "it" });
    expect(ok.success && ok.data.email).toBe("amico@example.com");
    expect(sendEmailInviteSchema.safeParse({ groupId: uuid, email: "non-una-email", locale: "it" }).success).toBe(false);
  });

  it("la lingua deve essere tra quelle del sito", () => {
    expect(createGroupSchema.safeParse({ itineraryId: uuid, name: "x", locale: "fr" }).success).toBe(false);
  });
});
