import { csvField } from "./export-csv";
import { CONVERSION_COLUMNS } from "./types";

// Modello CSV da scaricare per l'importazione delle conversioni: intestazione e due righe di prova.
// Separatore ";" (come il file esportato) e importi con la virgola. Le due righe usano subid
// inventati che non corrispondono a nessun click: l'anteprima le segnala come "senza click".
const TEMPLATE_EXAMPLES: readonly (readonly string[])[] = [
  ["getyourguide", "esempio000000001", "demo-conv-1", "120,00", "9,60", "approvata", "2026-10-01"],
  ["viator", "esempio000000002", "demo-conv-2", "45,00", "4,05", "in attesa", "2026-10-02"],
];

export function conversionImportTemplate(): string {
  const lines = [
    CONVERSION_COLUMNS.join(";"),
    ...TEMPLATE_EXAMPLES.map((example) => example.map(csvField).join(";")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
