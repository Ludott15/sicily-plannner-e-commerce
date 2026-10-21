import type { MenuIcon } from "@/components/layout/action-menu";

// Voci di navigazione condivise da intestazione, piè di pagina e pagina Esplora (la barra in basso
// su mobile porta lì). Le etichette sono chiavi del namespace Nav; gli href sono percorsi pubblici.
// Le voci dei servizi puntano solo alle pagine /voli, /dove-dormire, /noleggio-auto e /servizi.

export type NavLabelKey =
  | "navItineraries"
  | "activities"
  | "guides"
  | "flights"
  | "lodging"
  | "car"
  | "ferries"
  | "allServices"
  | "shop";

export type NavLink = { href: string; label: NavLabelKey; icon?: MenuIcon };

export const PRIMARY_NAV: readonly NavLink[] = [
  { href: "/itinerari", label: "navItineraries" },
  { href: "/attivita", label: "activities" },
  { href: "/guide", label: "guides" },
];

export const SERVICE_NAV: readonly NavLink[] = [
  { href: "/voli", label: "flights", icon: "plane" },
  { href: "/dove-dormire", label: "lodging", icon: "bed" },
  { href: "/noleggio-auto", label: "car", icon: "car" },
  { href: "/traghetti", label: "ferries", icon: "ship" },
  { href: "/servizi", label: "allServices", icon: "compass" },
];

export const SHOP_NAV: NavLink = { href: "/shop", label: "shop" };

// Voce attiva: il percorso corrente è la voce o una sua sottopagina. L'ancora (#...) non conta.
export function isNavCurrent(pathname: string, href: string): boolean {
  const path = href.split("#")[0] ?? href;
  return pathname === path || pathname.startsWith(`${path}/`);
}
