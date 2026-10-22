import { z } from "zod";

// Foto scelte dalla redazione (content/media/commons-scelte.json): schema e passi per l'importazione a lotti.
// Pura: usata dallo script locale (scripts/media/commons-fill.ts) e dall'azione admin.

// Una voce per entità. allow_sa: CC BY-SA ammessa solo per questa voce (scelta esplicita, docs/IMMAGINI.md).
export const chosenEntrySchema = z.object({
  type: z.enum(["activity", "place"]),
  slug: z.string().min(1).max(200),
  file: z.string().regex(/^File:.+/),
  motivo: z.string().max(500),
  alt_it: z.string().trim().min(1).max(300),
  allow_sa: z.boolean().optional(),
  // Bene culturale in consegna a un ente pubblico: il media si importa bloccato, in attesa di autorizzazione.
  bene_culturale: z.boolean().optional(),
});

export const chosenPhotosSchema = z.array(chosenEntrySchema).min(1);

export type ChosenPhoto = z.infer<typeof chosenEntrySchema>;

// Voci per passo nell'azione admin: piccolo, dentro i limiti di durata delle funzioni serverless.
export const CHOSEN_BATCH_SIZE = 3;

// Offset del passo successivo, o null quando il lotto è finito.
export function nextChosenOffset(offset: number, batchLength: number, total: number): number | null {
  const next = offset + batchLength;
  return next < total ? next : null;
}

export const chosenStepSchema = z.object({
  offset: z.number().int().min(0).max(10_000),
});

// Esito di una voce (uguale a ChosenResult di commons-fill.admin.ts, senza importarlo nei client).
export type ChosenItemResult = {
  type: ChosenPhoto["type"];
  slug: string;
  file: string;
  outcome: "assigned" | "already_imported" | "rejected" | "not_needed";
  reason?: string;
  license?: string | null;
  mediaId?: string;
};

// Divide le voci in passi di 'size' voci, nello stesso ordine del file.
export function chosenPages<T>(entries: readonly T[], size: number = CHOSEN_BATCH_SIZE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < entries.length; i += size) pages.push(entries.slice(i, i + size));
  return pages;
}
