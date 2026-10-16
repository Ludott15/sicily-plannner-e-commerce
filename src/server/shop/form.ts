// Lettura dei FormData dei form admin dello shop. Niente "use server": sono funzioni pure usate
// dalle azioni (*.admin.ts). Un campo assente o vuoto diventa stringa vuota o null.
import { centsFromEurInput } from "@/lib/shop/present";

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function formOptionalText(formData: FormData, name: string): string | null {
  const value = formText(formData, name);
  return value === "" ? null : value;
}

// Casella di spunta: il browser manda "on" quando è selezionata; accettiamo anche "true" e "1".
export function formFlag(formData: FormData, name: string): boolean {
  return ["on", "true", "1"].includes(formText(formData, name));
}

export function formList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
    .filter((value) => value !== "");
}

// Intero senza segno (stringa di sole cifre), oppure null se vuoto o non valido.
export function formInteger(formData: FormData, name: string): number | null {
  const value = formText(formData, name);
  if (!/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

// Importo in euro ("12,50" o "12.5") in centesimi, oppure null se vuoto o non valido.
export function formEurCents(formData: FormData, name: string): number | null {
  const value = formText(formData, name);
  return value === "" ? null : centsFromEurInput(value);
}

// Ogni chiave "boxQuantity:<productId>" con quantità positiva diventa un componente della box.
export function formBoxItems(formData: FormData): { productId: string; quantity: number }[] {
  const items: { productId: string; quantity: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("boxQuantity:") || typeof raw !== "string") continue;
    const quantity = Number(raw.trim());
    const productId = key.slice("boxQuantity:".length);
    if (Number.isInteger(quantity) && quantity > 0) items.push({ productId, quantity });
  }
  return items;
}
