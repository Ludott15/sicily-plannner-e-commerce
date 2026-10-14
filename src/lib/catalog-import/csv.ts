// Parser CSV scritto a mano (RFC 4180): virgolette con "" , a capo dentro le virgolette,
// CRLF, BOM iniziale, separatore "," o ";" dedotto dalla riga di intestazione.

export type CsvRow = { line: number; cells: string[] };

export type CsvDocument = {
  delimiter: "," | ";";
  header: string[];
  rows: CsvRow[];
};

export class CsvParseError extends Error {
  readonly code = "unterminated_quote" as const;
  readonly line: number;

  constructor(line: number) {
    super(`Unclosed quote starting at line ${line}`);
    this.name = "CsvParseError";
    this.line = line;
  }
}

// Conta i separatori fuori dalle virgolette nella prima riga non vuota.
function detectDelimiter(text: string): "," | ";" {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  let started = false;

  for (const ch of text) {
    if (!started) {
      if (ch === "\r" || ch === "\n" || ch === " " || ch === "\t") continue;
      started = true;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "\r" || ch === "\n") break;
    if (ch === ",") commas += 1;
    else if (ch === ";") semicolons += 1;
  }

  return semicolons > commas ? ";" : ",";
}

// Divide il testo in record. `line` è la riga fisica in cui il record inizia (1-based).
function tokenize(text: string, delimiter: string): CsvRow[] {
  const records: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (ch === "\r") {
        if (text.charAt(i + 1) === "\n") continue;
        field += "\n";
        line += 1;
      } else if (ch === "\n") {
        field += "\n";
        line += 1;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      quoteLine = line;
    } else if (ch === '"') {
      field += ch;
    } else if (ch === delimiter) {
      cells.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text.charAt(i + 1) === "\n") i += 1;
      cells.push(field);
      records.push({ line: recordLine, cells });
      cells = [];
      field = "";
      line += 1;
      recordLine = line;
    } else {
      field += ch;
    }
  }

  if (inQuotes) throw new CsvParseError(quoteLine);

  if (cells.length > 0 || field !== "") {
    cells.push(field);
    records.push({ line: recordLine, cells });
  }

  return records;
}

export function parseCsv(input: string): CsvDocument {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  // Le righe completamente vuote (tutte le celle vuote) non contano.
  const records = tokenize(text, delimiter).filter((record) => record.cells.some((cell) => cell.trim() !== ""));
  const [first, ...rest] = records;

  return {
    delimiter,
    header: first ? first.cells : [],
    rows: rest,
  };
}
