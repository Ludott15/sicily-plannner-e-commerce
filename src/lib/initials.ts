// Iniziali per l'avatar senza foto: la prima lettera del nome e del cognome, o le prime due lettere
// di un nome solo. Senza nome restituisce null (l'avatar mostra un'icona o un segnaposto).
export function initialsOf(name: string | null | undefined): string | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return null;
  const last = words[words.length - 1] ?? first;
  const letters = words.length > 1 ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2);
  return letters.toLocaleUpperCase("it-IT");
}
