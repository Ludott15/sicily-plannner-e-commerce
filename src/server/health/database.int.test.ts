import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { checkDatabase } from "./database";

// GET /api/health su Postgres locale (npm run test:int): il database risponde, la risposta non va in cache
// e non contiene nulla di interno (versioni, nomi, errori).

describe("GET /api/health", () => {
  it("risponde 200 { ok: true, db: 'ok' } con Cache-Control no-store", async () => {
    expect(await checkDatabase()).toBe("ok");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, db: "ok" });
  });
});
