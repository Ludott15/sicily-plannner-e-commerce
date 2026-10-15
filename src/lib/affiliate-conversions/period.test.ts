import { describe, expect, it } from "vitest";
import { parseIsoDay, resolvePeriod } from "./period";

// 15 ottobre 2026, ore 12:00 UTC.
const NOW = new Date("2026-10-15T12:00:00Z");

describe("resolvePeriod", () => {
  it("senza parametri usa gli ultimi 30 giorni, oggi incluso", () => {
    const period = resolvePeriod({}, NOW);
    expect(period.days).toBe(30);
    expect(period.to).toBe("2026-10-15");
    expect(period.from).toBe("2026-09-16");
    expect(period.start.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(period.endExclusive.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });

  it("giorni=7 e giorni=90 sono preset validi", () => {
    expect(resolvePeriod({ giorni: "7" }, NOW).from).toBe("2026-10-09");
    expect(resolvePeriod({ giorni: "90" }, NOW).days).toBe(90);
  });

  it("un preset non previsto ricade sul predefinito", () => {
    expect(resolvePeriod({ giorni: "15" }, NOW).days).toBe(30);
    expect(resolvePeriod({ giorni: "abc" }, NOW).days).toBe(30);
  });

  it("da e a validi hanno la precedenza e includono entrambi i giorni", () => {
    const period = resolvePeriod({ da: "2026-10-01", a: "2026-10-03" }, NOW);
    expect(period.days).toBeNull();
    expect(period.from).toBe("2026-10-01");
    expect(period.to).toBe("2026-10-03");
    expect(period.endExclusive.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("da dopo a, date non valide o un intervallo oltre 366 giorni ricadono sul predefinito", () => {
    expect(resolvePeriod({ da: "2026-10-05", a: "2026-10-01" }, NOW).days).toBe(30);
    expect(resolvePeriod({ da: "2026-02-30", a: "2026-10-01" }, NOW).days).toBe(30);
    expect(resolvePeriod({ da: "2024-01-01", a: "2026-10-01" }, NOW).days).toBe(30);
  });
});

describe("parseIsoDay", () => {
  it("accetta solo YYYY-MM-DD di un giorno esistente", () => {
    expect(parseIsoDay("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parseIsoDay("2026-10-1")).toBeNull();
    expect(parseIsoDay(null)).toBeNull();
  });
});
