import { describe, expect, it } from "vitest";
import { countParam, formatIsoDate, isoParam, oneOfParam, paramOf, queryString, rangeOk } from "@/lib/verticals/search-params";

describe("paramOf", () => {
  it("prende il primo valore, senza spazi, o stringa vuota", () => {
    expect(paramOf(" traghetti ")).toBe("traghetti");
    expect(paramOf(["a", "b"])).toBe("a");
    expect(paramOf(undefined)).toBe("");
  });
});

describe("isoParam", () => {
  it("accetta solo date ISO reali", () => {
    expect(isoParam("2027-05-01")).toBe("2027-05-01");
    expect(isoParam("2027-02-30")).toBe("");
    expect(isoParam("01/05/2027")).toBe("");
    expect(isoParam(undefined)).toBe("");
  });
});

describe("oneOfParam", () => {
  const ports = ["milazzo", "trapani"] as const;
  it("accetta solo i valori della lista chiusa", () => {
    expect(oneOfParam("milazzo", ports)).toBe("milazzo");
    expect(oneOfParam("palermo", ports)).toBe("");
    expect(oneOfParam("MILAZZO", ports)).toBe("");
    expect(oneOfParam("https://evil.example", ports)).toBe("");
  });
});

describe("countParam", () => {
  it("accetta interi nell'intervallo, altrimenti il ripiego", () => {
    expect(countParam("3", 2, 30)).toBe(3);
    expect(countParam("0", 2, 30)).toBe(2);
    expect(countParam("31", 2, 30)).toBe(2);
    expect(countParam("2.5", 2, 30)).toBe(2);
    expect(countParam("abc", 2, 30)).toBe(2);
  });
});

describe("queryString", () => {
  it("salta i valori vuoti e non produce un '?' se non resta nulla", () => {
    expect(queryString({ partner: "pitchup", kind: "" })).toBe("?partner=pitchup");
    expect(queryString({ kind: "" })).toBe("");
  });
});

describe("formatIsoDate", () => {
  it("formatta la data nella lingua della pagina senza spostarla di giorno", () => {
    expect(formatIsoDate("2027-05-01", "en")).toBe("1 May 2027");
    expect(formatIsoDate("2027-05-01", "it")).toBe("1 mag 2027");
  });
});

describe("rangeOk", () => {
  it("richiede entrambe le date e la fine dopo l'inizio", () => {
    expect(rangeOk("2027-05-01", "2027-05-03")).toBe(true);
    expect(rangeOk("2027-05-03", "2027-05-03")).toBe(false);
    expect(rangeOk("2027-05-01", "")).toBe(false);
  });
});
