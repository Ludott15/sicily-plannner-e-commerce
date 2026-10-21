import { describe, expect, it } from "vitest";
import { buildAirports, cleanCity, parseCsv } from "./airports.mjs";

const base = { id: "", ident: "", elevation_ft: "", icao_code: "", gps_code: "", local_code: "" };

function row(over: Record<string, string>) {
  return {
    ...base,
    type: "medium_airport",
    name: "Aeroporto di prova",
    municipality: "Città",
    continent: "EU",
    iso_country: "IT",
    scheduled_service: "yes",
    iata_code: "TST",
    ...over,
  };
}

const countries = [
  { code: "IT", name: "Italy" },
  { code: "US", name: "United States" },
  { code: "FR", name: "France" },
  { code: "BR", name: "Brazil" },
];

describe("parseCsv", () => {
  it("campi tra virgolette con virgole, virgolette doppie e a capo", () => {
    const text = 'a,b,c\r\n1,"due, tre","dice ""ciao"""\r\n4,"riga\nspezzata",6\r\n';
    expect(parseCsv(text)).toEqual([
      { a: "1", b: "due, tre", c: 'dice "ciao"' },
      { a: "4", b: "riga\nspezzata", c: "6" },
    ]);
  });

  it("scarta le righe con un numero di campi diverso dall'intestazione", () => {
    expect(parseCsv("x,y\n1,2\n3\n")).toEqual([{ x: "1", y: "2" }]);
  });
});

describe("cleanCity", () => {
  it("toglie il comune vicino tra parentesi, dopo la virgola o dopo la barra", () => {
    expect(cleanCity("Paris (Roissy-en-France, Val-d'Oise)")).toBe("Paris");
    expect(cleanCity("London, Essex")).toBe("London");
    expect(cleanCity("Cincinnati / Covington")).toBe("Cincinnati");
    expect(cleanCity("Roma")).toBe("Roma");
  });
});

describe("buildAirports", () => {
  it("tiene solo large e medium con servizio di linea e codice IATA di tre lettere", () => {
    const rows = [
      row({ iata_code: "AAA", type: "large_airport" }),
      row({ iata_code: "BBB", scheduled_service: "no" }),
      row({ iata_code: "", type: "medium_airport" }),
      row({ iata_code: "CCC", type: "heliport" }),
      row({ iata_code: "DDD", iso_country: "XX" }),
    ];
    expect(buildAirports(rows, countries).map((a) => a.iata)).toEqual(["AAA"]);
  });

  it("esclude gli aeroporti siciliani, che sono gli arrivi", () => {
    const rows = [row({ iata_code: "CTA", municipality: "Catania" }), row({ iata_code: "FCO", municipality: "Roma" })];
    expect(buildAirports(rows, countries).map((a) => a.iata)).toEqual(["FCO"]);
  });

  it("ordine: italiani, large europei, altri large, medium", () => {
    const rows = [
      row({ iata_code: "MED", type: "medium_airport", iso_country: "US", continent: "NA", municipality: "Aaa" }),
      row({ iata_code: "LUS", type: "large_airport", iso_country: "US", continent: "NA", municipality: "Zzz" }),
      row({ iata_code: "LFR", type: "large_airport", iso_country: "FR", continent: "EU", municipality: "Paris" }),
      row({ iata_code: "MIT", type: "medium_airport", iso_country: "IT", continent: "EU", municipality: "Bari" }),
    ];
    expect(buildAirports(rows, countries).map((a) => a.iata)).toEqual(["MIT", "LFR", "LUS", "MED"]);
  });

  it("un codice IATA ripetuto resta una sola volta, con la riga più pertinente", () => {
    const rows = [
      row({ iata_code: "DUP", type: "medium_airport", iso_country: "US", continent: "NA", name: "Medio" }),
      row({ iata_code: "DUP", type: "large_airport", iso_country: "US", continent: "NA", name: "Grande" }),
    ];
    const out = buildAirports(rows, countries);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("Grande");
  });

  it("città: nome italiano dove esiste, comune pulito altrimenti, città servita per i casi noti", () => {
    const rows = [
      row({ iata_code: "FCO", municipality: "Rome", iso_country: "IT", type: "large_airport" }),
      row({ iata_code: "MXP", municipality: "Ferno (VA)", iso_country: "IT", type: "large_airport" }),
      row({ iata_code: "CDG", municipality: "Paris (Roissy-en-France, Val-d'Oise)", iso_country: "FR", type: "large_airport", continent: "EU" }),
    ];
    const byCode = Object.fromEntries(buildAirports(rows, countries).map((a) => [a.iata, a]));
    expect(byCode.FCO).toMatchObject({ city_it: "Roma", city_en: "Rome", country: "IT" });
    expect(byCode.MXP).toMatchObject({ city_it: "Milano", city_en: "Milan" });
    expect(byCode.CDG).toMatchObject({ city_it: "Parigi", city_en: "Paris" });
  });

  it("output con i campi dello schema attuale", () => {
    const [airport] = buildAirports([row({ iata_code: "FCO", municipality: "Rome" })], countries);
    expect(Object.keys(airport ?? {}).sort()).toEqual(["city_en", "city_it", "country", "iata", "name"]);
  });
});
