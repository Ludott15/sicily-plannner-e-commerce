import { describe, expect, it, vi } from "vitest";

// Il modulo importa il database: nei test unitari il client non serve (la sonda è iniettata).
vi.mock("@/server/db/public", () => ({ dbPublic: vi.fn() }));

import { checkDatabase } from "./database";

describe("checkDatabase", () => {
  it("è ok se la sonda risponde in tempo", async () => {
    await expect(checkDatabase(async () => [{ "?column?": 1 }], 1000)).resolves.toBe("ok");
  });

  it("è error se la sonda fallisce, senza far trapelare l'errore", async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error("password authentication failed for user postgres");
      }, 1000),
    ).resolves.toBe("error");
  });

  it("è error se la sonda non risponde entro il limite", async () => {
    const never = () => new Promise<unknown>(() => undefined);
    await expect(checkDatabase(never, 20)).resolves.toBe("error");
  });
});
