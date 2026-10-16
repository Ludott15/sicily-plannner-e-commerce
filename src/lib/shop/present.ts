import { mediaUrl, variantPath, type CoverMedia } from "@/lib/media";

// Funzioni pure dell'interfaccia dello shop: prezzi in centesimi (IVA inclusa), input degli
// importi nei form admin, immagini di prodotto. Niente accessi a database né a window.

// Prezzo intero in centesimi formattato nella lingua della pagina: "12,50 €" in italiano,
// "€12.50" in inglese.
export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

// Importo digitato in un form ("12,50", "12.5", "12"): centesimi interi, oppure null se non valido.
export function centsFromEurInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

// Valore di un campo importo dal dato in centesimi: "12,50" (virgola, come si scrive in Italia).
export function eurInputFromCents(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Prezzo come testo decimale per il JSON-LD ("12.50").
export function eurDecimalFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// URL di una foto di prodotto per la card e il JSON-LD. Le illustrazioni sono SVG servite così
// come sono; le foto usano la variante quadrata da 800 px (docs/IMMAGINI.md). Senza varianti
// generate niente immagine: la card mostra il nome del prodotto.
export function productImageUrl(cover: CoverMedia | null): string | null {
  if (!cover) return null;
  if (cover.kind === "illustration") return mediaUrl(cover.storagePath);
  if (cover.variantsVersion === 0) return null;
  return mediaUrl(variantPath(cover.id, cover.variantsVersion, "1x1", 800, "webp"));
}
