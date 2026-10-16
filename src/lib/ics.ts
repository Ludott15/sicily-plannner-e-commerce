// Generatore puro di calendari iCalendar (RFC 5545) per l'export di un viaggio: un evento
// all-day per giorno. Nessun accesso al database né import server-only.

import { addIsoDays, isIsoDate } from "@/lib/trip-days";

export type CalendarEvent = {
  // Stabile nel tempo, per esempio `<itineraryId>-<n>@isula`.
  uid: string;
  // Data del giorno, YYYY-MM-DD.
  date: string;
  summary: string;
  description: string;
};

const LINE_LIMIT_OCTETS = 75;
const encoder = new TextEncoder();

// Escaping del testo (RFC 5545, 3.3.11): prima la barra rovesciata, poi punto e virgola, virgola
// e a capo. Un a capo nel testo diventa la sequenza \n.
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Ripiega una riga a 75 ottetti: le righe successive partono con uno spazio e contengono al più
// 74 ottetti di contenuto. Non spezza mai un carattere UTF-8 (il conteggio è per code point).
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = LINE_LIMIT_OCTETS;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = LINE_LIMIT_OCTETS - 1;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateValue(value: string): string {
  return value.replace(/-/g, "");
}

// Calendario completo: VCALENDAR con un VEVENT per evento, righe separate da CRLF e CRLF finale.
// DTSTAMP viene da `now`, così l'output è deterministico nei test.
export function buildCalendar(events: readonly CalendarEvent[], options: { now: Date; prodId?: string }): string {
  const stamp = utcStamp(options.now);
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${options.prodId ?? "-//Isula//Sicilia Planner//IT"}`, "CALSCALE:GREGORIAN"];

  for (const event of events) {
    if (!isIsoDate(event.date)) throw new RangeError(`Data evento non valida: ${event.date}`);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(event.uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${dateValue(addIsoDays(event.date, 1))}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description !== "") lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
