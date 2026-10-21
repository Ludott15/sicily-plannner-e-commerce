// Testo della ricerca aeroporti: senza accenti, senza maiuscole, separatori ridotti a spazio.
// Modulo senza dati, usabile anche nel browser (la combobox non importa l'elenco degli aeroporti).

// Minuscole, senza accenti, con i separatori ridotti a spazio: "Düsseldorf" e "dusseldorf" coincidono.
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
