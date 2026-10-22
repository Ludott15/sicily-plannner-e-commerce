// Aeroporti di partenza per la ricerca voli, da tutto il mondo (docs/LANCIO.md, "Voli").
//
//   npm run data:airports                     scarica OurAirports e riscrive src/data/departure-airports.json
//   npm run data:airports -- --input <dir>    usa airports.csv e countries.csv già scaricati in <dir>
//
// Fonte: OurAirports (https://ourairports.com/data/), dati pubblici di pubblico dominio:
//   https://davidmegginson.github.io/ourairports-data/airports.csv
//   https://davidmegginson.github.io/ourairports-data/countries.csv
// Filtri: tipo large_airport o medium_airport, scheduled_service = yes, codice IATA di tre
// lettere. Gli aeroporti siciliani non sono partenze (sono gli arrivi): esclusi.
// Ordine (stabile): italiani, poi large europei, poi large degli altri continenti, poi i medium;
// dentro ogni gruppo per città inglese e codice. Lo script è deterministico: il file si committa.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE = {
  airports: "https://davidmegginson.github.io/ourairports-data/airports.csv",
  countries: "https://davidmegginson.github.io/ourairports-data/countries.csv",
};

// Stessi codici di src/lib/flights/airports.ts: sono destinazioni, non partenze.
const SICILY_CODES = new Set(["CTA", "PMO", "TPS", "CIY", "LMP", "PNL"]);

// Nomi italiani delle città principali (chiave: municipality in inglese, come in OurAirports).
// Le altre città usano il nome locale.
const CITY_IT = {
  Rome: "Roma",
  Milan: "Milano",
  Florence: "Firenze",
  Turin: "Torino",
  Naples: "Napoli",
  Venice: "Venezia",
  Genoa: "Genova",
  Padua: "Padova",
  Leghorn: "Livorno",
  Verona: "Verona",
  Trieste: "Trieste",
  London: "Londra",
  Paris: "Parigi",
  Munich: "Monaco di Baviera",
  "New York": "Nuova York",
  Cologne: "Colonia",
  Frankfurt: "Francoforte sul Meno",
  Hamburg: "Amburgo",
  Berlin: "Berlino",
  Nuremberg: "Norimberga",
  Hanover: "Hannover",
  Stuttgart: "Stoccarda",
  Dresden: "Dresda",
  Leipzig: "Lipsia",
  Vienna: "Vienna",
  Prague: "Praga",
  Lisbon: "Lisbona",
  Athens: "Atene",
  Moscow: "Mosca",
  "Saint Petersburg": "San Pietroburgo",
  Warsaw: "Varsavia",
  Krakow: "Cracovia",
  Gdansk: "Danzica",
  Copenhagen: "Copenaghen",
  Stockholm: "Stoccolma",
  Brussels: "Bruxelles",
  Zurich: "Zurigo",
  Geneva: "Ginevra",
  Basel: "Basilea",
  Dublin: "Dublino",
  Bucharest: "Bucarest",
  Belgrade: "Belgrado",
  Zagreb: "Zagabria",
  Ljubljana: "Lubiana",
  Kyiv: "Kiev",
  Kiev: "Kiev",
  Valletta: "La Valletta",
  Thessaloniki: "Salonicco",
  Rhodes: "Rodi",
  Corfu: "Corfù",
  Chania: "La Canea",
  Marseille: "Marsiglia",
  Nice: "Nizza",
  Lyon: "Lione",
  Toulouse: "Tolosa",
  Edinburgh: "Edimburgo",
  Barcelona: "Barcellona",
  Seville: "Siviglia",
  Palma: "Palma di Maiorca",
  Istanbul: "Istanbul",
  Cairo: "Il Cairo",
  Tunis: "Tunisi",
  Algiers: "Algeri",
  Beijing: "Pechino",
  Seoul: "Seul",
  "New Delhi": "Nuova Delhi",
  "Mexico City": "Città del Messico",
  "São Paulo": "San Paolo",
  "Sao Paulo": "San Paolo",
  "Abu Dhabi": "Abu Dhabi",
  Montreal: "Montreal",
  "Tel Aviv": "Tel Aviv",
  Mumbai: "Mumbai",
  Bangkok: "Bangkok",
  "Hong Kong": "Hong Kong",
  Jerusalem: "Gerusalemme",
  Madrid: "Madrid",
};

// Aeroporti la cui municipality di OurAirports è un comune vicino: la città è quella servita.
const CITY_BY_IATA = {
  MXP: "Milan",
  LIN: "Milan",
  BGY: "Bergamo",
  CDG: "Paris",
  ORY: "Paris",
  BVA: "Paris",
  STN: "London",
  LGW: "London",
  LHR: "London",
  LTN: "London",
  SEN: "London",
  VRN: "Verona",
  TRN: "Torino",
  TRS: "Trieste",
  AOI: "Ancona",
  CRV: "Crotone",
  CUF: "Cuneo",
  VBS: "Brescia",
  EBA: "Elba",
  BSL: "Basel",
};

// Il comune vicino tra parentesi o dopo la virgola ("Paris (Roissy-en-France, Val-d'Oise)", "London, Essex")
// non serve alla ricerca: si tiene il nome della città.
export function cleanCity(municipality) {
  return municipality.replace(/\s*\([^)]*\)\s*$/, "").split(/[,/]/)[0].trim();
}

// CSV RFC 4180: campi tra virgolette, con virgole e a capo, e "" per una virgoletta.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function readSource(inputDir) {
  if (inputDir) {
    const [airports, countries] = await Promise.all([
      readFile(path.join(inputDir, "airports.csv"), "utf8"),
      readFile(path.join(inputDir, "countries.csv"), "utf8"),
    ]);
    return { airports, countries };
  }
  const [airports, countries] = await Promise.all([fetchText(SOURCE.airports), fetchText(SOURCE.countries)]);
  return { airports, countries };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`);
  return res.text();
}

// Rango per l'ordinamento: italiani, large europei, large degli altri, medium.
function rankOf(row, europe) {
  if (row.iso_country === "IT") return 0;
  if (row.type === "large_airport") return europe ? 1 : 2;
  return 3;
}

export function buildAirports(airportRows, countryRows) {
  const knownCountries = new Set(countryRows.map((c) => c.code));
  const candidates = airportRows.filter(
    (r) =>
      (r.type === "large_airport" || r.type === "medium_airport") &&
      r.scheduled_service === "yes" &&
      /^[A-Z]{3}$/.test(r.iata_code ?? "") &&
      /^[A-Z]{2}$/.test(r.iso_country ?? "") &&
      knownCountries.has(r.iso_country) &&
      !SICILY_CODES.has(r.iata_code),
  );

  const ranked = candidates
    .map((r) => {
      const cityEn = CITY_BY_IATA[r.iata_code] ?? cleanCity(r.municipality || r.name);
      return {
        rank: rankOf(r, r.continent === "EU"),
        iata: r.iata_code,
        city_it: CITY_IT[cityEn] ?? cityEn,
        city_en: cityEn,
        name: r.name.trim(),
        country: r.iso_country,
      };
    })
    .sort((a, b) => a.rank - b.rank || compare(a.city_en, b.city_en) || compare(a.iata, b.iata));

  // Un codice IATA può comparire più volte (aeroporti chiusi o doppi): vince il primo, cioè il più pertinente.
  const seen = new Set();
  const out = [];
  for (const { iata, city_it, city_en, name, country } of ranked) {
    if (seen.has(iata)) continue;
    seen.add(iata);
    out.push({ iata, city_it, city_en, name, country });
  }
  return out;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toJson(airports) {
  const lines = airports.map((a) => `  ${JSON.stringify(a)}`);
  return `[\n${lines.join(",\n")}\n]\n`;
}

async function main() {
  const argv = process.argv.slice(2);
  const inputIndex = argv.indexOf("--input");
  const inputDir = inputIndex >= 0 ? argv[inputIndex + 1] : null;
  if (inputIndex >= 0 && !inputDir) throw new Error("--input richiede una cartella");

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const outFile = path.join(root, "src", "data", "departure-airports.json");

  const source = await readSource(inputDir);
  const airports = buildAirports(parseCsv(source.airports), parseCsv(source.countries));
  await writeFile(outFile, toJson(airports), "utf8");
  const byType = airports.reduce((acc, a) => acc.set(a.country, (acc.get(a.country) ?? 0) + 1), new Map());
  console.log(`Aeroporti scritti: ${airports.length} in ${byType.size} paesi → ${path.relative(root, outFile)}`);
}

// Esegue solo da riga di comando: così i test importano parseCsv e buildAirports senza effetti.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
