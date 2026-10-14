// Aeroporti siciliani di arrivo (docs/ROADMAP.md, passo 2.1). Un solo elenco per la ricerca voli,
// l'onboarding e il motore di personalizzazione (src/server/personalization/config.ts).
// Codici IATA pubblici; le coordinate sono quelle delle piste (bonus "vicino all'aeroporto").

export const SICILY_AIRPORT_CODES = ["CTA", "PMO", "TPS", "CIY", "LMP", "PNL"] as const;

export type SicilyAirportCode = (typeof SICILY_AIRPORT_CODES)[number];

export type SicilyAirport = {
  iata: SicilyAirportCode;
  name: { it: string; en: string };
  city: { it: string; en: string };
  lat: number;
  lng: number;
};

export const SICILY_AIRPORTS: Record<SicilyAirportCode, SicilyAirport> = {
  CTA: {
    iata: "CTA",
    name: { it: "Catania Fontanarossa", en: "Catania Fontanarossa" },
    city: { it: "Catania", en: "Catania" },
    lat: 37.4668,
    lng: 15.0664,
  },
  PMO: {
    iata: "PMO",
    name: { it: "Palermo Falcone e Borsellino", en: "Palermo Falcone-Borsellino" },
    city: { it: "Palermo", en: "Palermo" },
    lat: 38.176,
    lng: 13.091,
  },
  TPS: {
    iata: "TPS",
    name: { it: "Trapani-Birgi", en: "Trapani-Birgi" },
    city: { it: "Trapani", en: "Trapani" },
    lat: 37.9114,
    lng: 12.488,
  },
  CIY: {
    iata: "CIY",
    name: { it: "Comiso", en: "Comiso" },
    city: { it: "Comiso (Ragusa)", en: "Comiso (Ragusa)" },
    lat: 36.9946,
    lng: 14.6072,
  },
  LMP: {
    iata: "LMP",
    name: { it: "Lampedusa", en: "Lampedusa" },
    city: { it: "Lampedusa", en: "Lampedusa" },
    lat: 35.4978,
    lng: 12.6183,
  },
  PNL: {
    iata: "PNL",
    name: { it: "Pantelleria", en: "Pantelleria" },
    city: { it: "Pantelleria", en: "Pantelleria" },
    lat: 36.8166,
    lng: 11.9689,
  },
};

export function isSicilyAirport(code: string): code is SicilyAirportCode {
  return (SICILY_AIRPORT_CODES as readonly string[]).includes(code);
}
