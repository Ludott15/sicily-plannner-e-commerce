import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("accetta percorsi interni", () => {
    expect(safeNextPath("/it/profilo")).toBe("/it/profilo");
  });

  it("mantiene query e hash", () => {
    expect(safeNextPath("/it/profilo?tab=1#x")).toBe("/it/profilo?tab=1#x");
  });

  it("accetta il ritorno a un invito di gruppo con il token", () => {
    const token = "a".repeat(43);
    expect(safeNextPath(`/it/invito/${token}`, "/it")).toBe(`/it/invito/${token}`);
  });

  it("rifiuta un invito con un'origine esterna", () => {
    expect(safeNextPath("https://evil.com/it/invito/token", "/it")).toBe("/it");
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
