import { usesPlace, type SearchField, type VerticalLink } from "./vertical-links";

// Pagine verificate dei partner (verifica dei deep link, 2026-10-21, letture pubbliche). Mappa chiusa
// lato server: il segmento entra nel template del partner con {page}. La chiave è:
//  - lo slug del luogo del catalogo (alloggi, biglietti, barche, bagagli, transfer);
//  - il codice aeroporto (noleggi);
//  - "da>a" con i codici dei porti (traghetti).
// Città, aeroporti o tratte non in mappa: il link va alla home del partner (passesSearch "none").
// Aggiungere una pagina: solo dopo averla aperta nel browser e averne confermato il formato.
// Lo slug "palermo" è quello del catalogo reale: confermare dopo il caricamento (il seed usa demo-palermo).
// covers: i campi della ricerca che la pagina porta al partner.

export type PartnerPage = { value: string; covers: readonly SearchField[] };

export const PARTNER_PAGES: Readonly<Record<string, Readonly<Record<string, PartnerPage>>>> = {
  // Palermo, con data e ospiti (verificato: la barra mostra "1 Dec - 3 Dec, 3 Guests"; formato da pagina città).
  hostelworld: {
    palermo: {
      value: "q=Palermo%2C+Italy&country=Italy&city=Palermo&type=city&id=1216&page=1",
      covers: ["place"],
    },
  },
  // Pagina della città (verificato: "Things to do in Palermo").
  tiqets: { palermo: { value: "en/palermo-attractions-c71428/", covers: ["place"] } },
  // Pagina della città (verificato: "Boat rental in Palermo"; i filtri sono nel percorso, non in query).
  clickandboat: { palermo: { value: "us/boat-rental/italy/palermo", covers: ["place"] } },
  // Pagina della città (verificato: "Luggage Storage Palermo"; la pagina del porto non è stata provata).
  radicalstorage: { palermo: { value: "luggage-storage/palermo", covers: ["place"] } },
  // Aeroporto di Catania (verificato: pagina valida).
  rentalcars: { CTA: { value: "on/airport/it/cta/rentacar", covers: ["airport"] } },
  // Destinazione Catania (verificato: pagina valida; i parametri di data non pre-compilano il form).
  discovercars: { CTA: { value: "it/italy-sicily/catania-sicily", covers: ["airport"] } },
  // Tratta Milazzo-Lipari (verificato: pagina di rotta valida; nessun parametro di data).
  directferries: { "milazzo>lipari": { value: "milazzo_lipari_ferry.htm", covers: ["from", "to"] } },
};

// Pagina verificata per un link validato, o null se la verticale non ne usa una o la chiave non è in mappa.
export function pageFor(
  link: Pick<VerticalLink, "partner" | "vertical" | "place" | "from" | "to" | "airport">,
): PartnerPage | null {
  let key: string | null = null;
  if (link.vertical === "car") key = link.airport;
  else if (link.vertical === "ferry") key = `${link.from}>${link.to}`;
  else if (usesPlace(link.vertical)) key = link.place;
  if (!key) return null;
  return PARTNER_PAGES[link.partner]?.[key] ?? null;
}
