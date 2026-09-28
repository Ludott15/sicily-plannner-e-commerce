// Colori di dominio (manuale, "Fondamenta visive"):
// mare = viaggio (mare, natura, spostamenti); pistacchio = gusto (cibo, vino, prodotti).
// Gli altri interessi non hanno un colore di dominio.

export type Domain = "mare" | "pistacchio";

const INTEREST_DOMAINS: Record<string, Domain> = {
  sea: "mare",
  nature_hiking: "mare",
  food_wine: "pistacchio",
};

export function interestDomain(interestKey: string): Domain | undefined {
  return INTEREST_DOMAINS[interestKey];
}
