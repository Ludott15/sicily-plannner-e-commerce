// Porti per la ricerca di traghetti (verticale "ferry", /traghetti). Lista chiusa: il server accetta
// solo questi codici (slug) nei link firmati e nei segnaposto del template; nessun porto arriva dall'input
// libero. Porti di partenza e arrivo: Sicilia e approdi verso le isole e la penisola.
// Da confermare con i programmi di ogni traghettatore prima di aggiungere porti.

export const FERRY_PORT_CODES = [
  "milazzo",
  "palermo",
  "trapani",
  "messina",
  "villa-san-giovanni",
  "reggio-calabria",
  "napoli",
  "pozzallo",
  "porto-empedocle",
  "lipari",
] as const;

export type FerryPortCode = (typeof FERRY_PORT_CODES)[number];

export type FerryPort = { code: FerryPortCode; name: { it: string; en: string } };

export const FERRY_PORTS: Record<FerryPortCode, FerryPort> = {
  // Eolie: si parte da Milazzo.
  milazzo: { code: "milazzo", name: { it: "Milazzo", en: "Milazzo" } },
  palermo: { code: "palermo", name: { it: "Palermo", en: "Palermo" } },
  // Egadi e Pantelleria: si parte da Trapani.
  trapani: { code: "trapani", name: { it: "Trapani", en: "Trapani" } },
  messina: { code: "messina", name: { it: "Messina", en: "Messina" } },
  "villa-san-giovanni": { code: "villa-san-giovanni", name: { it: "Villa San Giovanni", en: "Villa San Giovanni" } },
  "reggio-calabria": { code: "reggio-calabria", name: { it: "Reggio Calabria", en: "Reggio Calabria" } },
  napoli: { code: "napoli", name: { it: "Napoli", en: "Naples" } },
  // Malta: partenza da Pozzallo (ragusano).
  pozzallo: { code: "pozzallo", name: { it: "Pozzallo", en: "Pozzallo" } },
  // Lampedusa: partenza da Porto Empedocle.
  "porto-empedocle": { code: "porto-empedocle", name: { it: "Porto Empedocle", en: "Porto Empedocle" } },
  // Eolie: approdo principale dell'arcipelago (tratta da Milazzo verificata).
  lipari: { code: "lipari", name: { it: "Lipari", en: "Lipari" } },
};

export function isFerryPort(value: string): value is FerryPortCode {
  return (FERRY_PORT_CODES as readonly string[]).includes(value);
}

export function ferryPortName(code: FerryPortCode, locale: string): string {
  return locale === "en" ? FERRY_PORTS[code].name.en : FERRY_PORTS[code].name.it;
}
