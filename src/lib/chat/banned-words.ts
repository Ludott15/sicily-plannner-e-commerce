// Parole e forme vietate dal manuale del brand (docs/design/brand/manuale.md, "Regole"), anche nelle
// risposte del chatbot. Usate dal controllo della valutazione (eval) e dai test: pure, nessun I/O.

// Parole intere, senza distinzione di maiuscole. "autentico" vale solo quando è usato da solo:
// qui si vieta la forma intera, il contesto lo decide l'eval.
const BANNED_WORDS = ["magico", "magica", "magici", "magiche", "incantevole", "incantevoli", "perla", "perle", "autentico"] as const;

// Frasi intere vietate.
const BANNED_PHRASES = ["da non perdere"] as const;

const EMOJI = /\p{Extended_Pictographic}/u;

export type BannedFinding = { kind: "word" | "phrase" | "multiple_exclamation" | "emoji"; match: string };

// Tutte le violazioni trovate nel testo (vuoto se il testo è accettabile).
export function findBannedContent(text: string): BannedFinding[] {
  const findings: BannedFinding[] = [];
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`(^|[^\\p{L}])${word}(?=$|[^\\p{L}])`, "iu");
    if (pattern.test(lower)) findings.push({ kind: "word", match: word });
  }
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) findings.push({ kind: "phrase", match: phrase });
  }
  if (/!{2,}/.test(text)) findings.push({ kind: "multiple_exclamation", match: "!!" });
  const emoji = text.match(EMOJI);
  if (emoji) findings.push({ kind: "emoji", match: emoji[0] });
  return findings;
}

export function hasBannedContent(text: string): boolean {
  return findBannedContent(text).length > 0;
}
