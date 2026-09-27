import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("accetta percorsi interni", () => {
    expect(safeNextPath("/it/profilo")).toBe("/it/profilo");
  });

  it("mantiene query e hash", () => {
    expect(safeNextPath("/it/profilo?tab=1#x")).toBe("/it/profilo?tab=1#x");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "profilo",
  ])(
    "rifiuta %s",
    (next) => {
      expect(safeNextPath(next, "/it")).toBe("/it");
    },
  );
});
