import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "./ics";

const now = new Date("2026-10-14T08:05:09.123Z");

describe("escapeText", () => {
  it("escapa barra rovesciata, punto e virgola, virgola e a capo", () => {
    // Ingresso: a \ b ; c , d <a capo> e
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("un ritorno a capo Windows diventa \\n", () => {
    expect(escapeText("riga\r\nodue")).toBe("riga\\nodue");
  });
});

describe("foldLine", () => {
  it("una riga corta resta intera", () => {
    expect(foldLine("SUMMARY:Giorno 1")).toBe("SUMMARY:Giorno 1");
  });

  it("ripiega a 75 ottetti; le righe successive partono con spazio e hanno 74 ottetti di contenuto", () => {
    const folded = foldLine("A".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts[1]!.startsWith(" ")).toBe(true);
    expect(parts[1]!.slice(1)).toHaveLength(74);
    expect(parts.map((p) => (p.startsWith(" ") ? p.slice(1) : p)).join("")).toBe("A".repeat(200));
  });

  it("non spezza un carattere multibyte: ogni riga resta sotto 75 ottetti", () => {
    const line = "è".repeat(100); // 2 ottetti ciascuno
    const parts = foldLine(line).split("\r\n");
    for (const part of parts) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(parts.map((p) => (p.startsWith(" ") ? p.slice(1) : p)).join("")).toBe(line);
  });
});

describe("buildCalendar", () => {
  const events = [
    {
      uid: "it-1-1@isula",
      date: "2026-07-14",
      summary: "Giorno 1 · Palermo, Monreale",
      description: "Mattina: Cattedrale\nNota: arrivo, tardi",
    },
    { uid: "it-1-2@isula", date: "2026-07-15", summary: "Giorno 2", description: "" },
  ];

  it("un VEVENT all-day per giorno, con DTEND al giorno dopo e UID stabile", () => {
    const ics = buildCalendar(events, { now });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:it-1-1@isula\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260714\r\nDTEND;VALUE=DATE:20260715\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260715\r\nDTEND;VALUE=DATE:20260716\r\n");
  });

  it("usa CRLF ovunque e termina con CRLF", () => {
    const ics = buildCalendar(events, { now });
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapa il testo e ripiega le righe lunghe", () => {
    const ics = buildCalendar(events, { now });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Giorno 1 · Palermo\\, Monreale");
    expect(unfolded).toContain("DESCRIPTION:Mattina: Cattedrale\\nNota: arrivo\\, tardi");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("DTSTAMP in UTC dal momento passato, senza DESCRIPTION vuota", () => {
    const ics = buildCalendar(events, { now });
    expect(ics).toContain("DTSTAMP:20261014T080509Z");
    const secondEvent = ics.slice(ics.indexOf("UID:it-1-2@isula"));
    expect(secondEvent).not.toContain("DESCRIPTION:");
  });

  it("rifiuta una data che non è YYYY-MM-DD reale", () => {
    expect(() => buildCalendar([{ uid: "x", date: "2026-02-30", summary: "s", description: "" }], { now })).toThrow(RangeError);
  });

  it("senza eventi resta un calendario valido", () => {
    expect(buildCalendar([], { now })).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Isula//Sicilia Planner//IT\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n",
    );
  });
});
