// Stazioni per la ricerca di treni e bus (verticale "train", /treni-e-bus). Lista chiusa: il server
// accetta solo questi codici (slug) nei link firmati; il nome va nel segnaposto del template.
// Città siciliane e principali italiane collegate dal servizio ferroviario e dagli autobus.

export const TRAIN_CITY_CODES = [
  "palermo",
  "catania",
  "messina",
  "siracusa",
  "trapani",
  "agrigento",
  "ragusa",
  "enna",
  "caltanissetta",
  "roma",
  "napoli",
  "firenze",
  "bologna",
  "milano",
  "venezia",
  "torino",
  "genova",
] as const;

export type TrainCityCode = (typeof TRAIN_CITY_CODES)[number];

export type TrainCity = { code: TrainCityCode; name: { it: string; en: string } };

export const TRAIN_CITIES: Record<TrainCityCode, TrainCity> = {
  palermo: { code: "palermo", name: { it: "Palermo", en: "Palermo" } },
  catania: { code: "catania", name: { it: "Catania", en: "Catania" } },
  messina: { code: "messina", name: { it: "Messina", en: "Messina" } },
  siracusa: { code: "siracusa", name: { it: "Siracusa", en: "Syracuse" } },
  trapani: { code: "trapani", name: { it: "Trapani", en: "Trapani" } },
  agrigento: { code: "agrigento", name: { it: "Agrigento", en: "Agrigento" } },
  ragusa: { code: "ragusa", name: { it: "Ragusa", en: "Ragusa" } },
  enna: { code: "enna", name: { it: "Enna", en: "Enna" } },
  caltanissetta: { code: "caltanissetta", name: { it: "Caltanissetta", en: "Caltanissetta" } },
  roma: { code: "roma", name: { it: "Roma", en: "Rome" } },
  napoli: { code: "napoli", name: { it: "Napoli", en: "Naples" } },
  firenze: { code: "firenze", name: { it: "Firenze", en: "Florence" } },
  bologna: { code: "bologna", name: { it: "Bologna", en: "Bologna" } },
  milano: { code: "milano", name: { it: "Milano", en: "Milan" } },
  venezia: { code: "venezia", name: { it: "Venezia", en: "Venice" } },
  torino: { code: "torino", name: { it: "Torino", en: "Turin" } },
  genova: { code: "genova", name: { it: "Genova", en: "Genoa" } },
};

export function isTrainCity(value: string): value is TrainCityCode {
  return (TRAIN_CITY_CODES as readonly string[]).includes(value);
}

export function trainCityName(code: TrainCityCode, locale: string): string {
  return locale === "en" ? TRAIN_CITIES[code].name.en : TRAIN_CITIES[code].name.it;
}
