import type { CoverMedia } from "@/lib/media";
import type { Allergen } from "@/lib/shop/allergens";
import type { ProductCategory, StockStatus, VatRate } from "@/lib/shop/config";

// Lingua della risposta: "it" o "en". Titoli e descrizioni ricadono sull'italiano se manca l'inglese.
export type ShopLocale = string;

// Card di prodotto nelle liste pubbliche. Mai costo, codice del fornitore né id del fornitore.
// Il prezzo è IVA inclusa. cover è la prima foto della galleria.
export type ShopCard = {
  id: string;
  slug: string;
  title: string;
  category: ProductCategory;
  formatLabel: string | null;
  priceCents: number;
  vatRate: VatRate;
  stockStatus: StockStatus;
  // Luogo di origine (o area, se il luogo manca), nella lingua richiesta.
  origin: string | null;
  producer: { slug: string; name: string };
  cover: CoverMedia | null;
};

export type ShopProduct = ShopCard & {
  descriptionText: string | null;
  ingredients: string | null;
  allergens: Allergen[];
  // true quando l'elenco allergeni è stato verificato (anche se vuoto: "nessuno dei 14").
  allergensDeclared: boolean;
  storage: string | null;
  minShelfLifeDays: number | null;
  isPerishable: boolean;
  leadTimeDays: number;
  gallery: CoverMedia[];
  links: { kind: "place" | "activity"; slug: string; title: string }[];
  boxItems: { slug: string; title: string; quantity: number }[];
};

// Produttore pubblico (marchio di origine). Nessuna email, partita IVA o indirizzo.
export type ShopProducer = {
  slug: string;
  name: string;
  // Solo il testo della lingua richiesta: se manca, la pagina non mostra la sezione.
  story: string | null;
  cover: CoverMedia | null;
  place: { slug: string; name: string } | null;
  area: { slug: string; name: string } | null;
};

// Filtri della lista /shop: tutti in URL. Area e produttore sono slug.
export type ShopFilters = {
  category?: ProductCategory;
  producer?: string;
  area?: string;
  maxPriceCents?: number;
};
