import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./auth";

describe("autorizzazione dei cron", () => {
  it("accetta solo il Bearer con il segreto giusto", () => {
    expect(isAuthorizedCron("Bearer s3greto-lungo", "s3greto-lungo")).toBe(true);
    expect(isAuthorizedCron("Bearer altro", "s3greto-lungo")).toBe(false);
    expect(isAuthorizedCron("s3greto-lungo", "s3greto-lungo")).toBe(false);
    expect(isAuthorizedCron(null, "s3greto-lungo")).toBe(false);
  });

  it("senza segreto configurato rifiuta tutto", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});
