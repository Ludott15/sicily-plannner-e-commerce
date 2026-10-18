import "server-only";
import { activityRefIds } from "@/lib/chat/events";

// Testo del modello e dati del catalogo (passo 9.1). Pure: nessun I/O.
//
// Due regole: (1) il modello non scrive URL, quindi quelli che compaiono nel testo si tolgono e
// il fatto si registra (urlsRemoved); (2) un riferimento [[activity:<id>]] resta solo se l'id è
// tra quelli restituiti da uno strumento della sessione. Gli altri marcatori si tolgono.

const MARKDOWN_LINK = /\[([^\]\n]*)\]\((?:https?:\/\/|www\.)[^)\s]*\)/gi;
const BARE_URL = /(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const ACTIVITY_MARKER = /\[\[activity:[^\]]*\]\]/gi;

export type SanitizedText = { text: string; urlsRemoved: number; refsRemoved: number };

export function sanitizeAssistantText(raw: string, allowedIds: ReadonlySet<string>): SanitizedText {
  let urlsRemoved = 0;
  let text = raw.replace(MARKDOWN_LINK, (_match, label: string) => {
    urlsRemoved += 1;
    return label;
  });
  text = text.replace(BARE_URL, () => {
    urlsRemoved += 1;
    return "";
  });

  let refsRemoved = 0;
  text = text.replace(ACTIVITY_MARKER, (marker) => {
    const id = marker.slice("[[activity:".length, -2).trim().toLowerCase();
    if (isUuid(id) && allowedIds.has(id)) return `[[activity:${id}]]`;
    refsRemoved += 1;
    return "";
  });

  // Dopo le rimozioni: spazi doppi, spazi prima della punteggiatura, righe vuote in eccesso.
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, urlsRemoved, refsRemoved };
}

// Id validi che compaiono nel testo già ripulito (nell'ordine di comparsa).
export function citedActivityIds(text: string, allowedIds: ReadonlySet<string>): string[] {
  return activityRefIds(text).filter((id) => allowedIds.has(id));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Escaping dei dati del catalogo prima di metterli nel contesto: < e > diventano entità, così
// nessun testo (titolo, descrizione, recensione) può chiudere il tag <dati_catalogo> né
// introdurne uno nuovo. Il contenuto resta leggibile per il modello.
export function escapeCatalogText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const CATALOG_DATA_TAG = "dati_catalogo";

// Un oggetto dei dati del catalogo come JSON dentro il tag, con i caratteri pericolosi escapati.
export function catalogDataBlock(value: unknown): string {
  return `<${CATALOG_DATA_TAG}>${escapeCatalogText(JSON.stringify(value))}</${CATALOG_DATA_TAG}>`;
}

// Taglia un testo lungo (descrizioni, recensioni) senza spezzare la parola a metà, se possibile.
export function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
