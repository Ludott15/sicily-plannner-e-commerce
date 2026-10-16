// I 14 allergeni da indicare per legge (Reg. UE 1169/2011, allegato II). L'elenco è chiuso:
// la colonna products.allergens accetta solo queste chiavi (check products_allergens_valid in
// src/server/db/schema/shop.ts). Le etichette stanno nei messaggi (namespace Shop.allergenNames).
// Il test schema-vocabulary.test.ts verifica che l'elenco coincida con lo schema.

export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export function isAllergen(value: string): value is Allergen {
  return (ALLERGENS as readonly string[]).includes(value);
}

export type AllergenParse = { ok: true; keys: Allergen[] } | { ok: false; unknown: string[] };

// Legge un elenco di chiavi (per esempio "gluten, milk" dal CSV o i campi allergens[] del form).
// Accetta spazi e maiuscole, toglie i duplicati e restituisce le chiavi nell'ordine ufficiale.
// Un valore sconosciuto rende il risultato un errore con l'elenco dei valori respinti.
export function parseAllergens(input: readonly string[]): AllergenParse {
  const wanted = new Set<string>();
  const unknown: string[] = [];
  for (const raw of input) {
    const value = raw.trim().toLowerCase();
    if (value === "") continue;
    if (isAllergen(value)) wanted.add(value);
    else unknown.push(raw.trim());
  }
  if (unknown.length > 0) return { ok: false, unknown };
  return { ok: true, keys: ALLERGENS.filter((key) => wanted.has(key)) };
}
