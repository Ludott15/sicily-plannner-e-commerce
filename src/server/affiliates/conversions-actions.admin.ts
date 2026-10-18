"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  MAX_CONVERSION_BYTES,
  type ConversionFileError,
  type ConversionImportOutcome,
  type ConversionImportPreview,
  type ConversionImportResult,
} from "@/lib/affiliate-conversions/types";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { buildConversionImportPreview, commitConversionImport } from "./conversions-import.admin";

// Importazione CSV delle conversioni affiliate (passo 3.3). Zod → requireAdmin → lettura del file
// → anteprima o conferma (in conversions-import.admin.ts). Il file non viene mai salvato.

const DASHBOARD_PATH = "/[locale]/admin/affiliati";

export type ConversionImportState =
  | { status: "idle" }
  | { status: "preview"; preview: ConversionImportPreview }
  | { status: "imported"; result: ConversionImportResult }
  | { status: "error"; code: ConversionFileError; columns?: string[] };

const intentSchema = z.enum(["preview", "commit"]);
const fileSchema = z.instanceof(File);

// Codice del DB (es. 23505) per il log: mai il messaggio, che può contenere valori del file.
function errorCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

function fromOutcome(outcome: ConversionImportOutcome): ConversionImportState {
  if (outcome.status === "preview") return { status: "preview", preview: outcome.preview };
  if (outcome.status === "imported") return { status: "imported", result: outcome.result };
  return outcome.columns === undefined
    ? { status: "error", code: outcome.code }
    : { status: "error", code: outcome.code, columns: outcome.columns };
}

export async function conversionImportAction(
  _prev: ConversionImportState,
  formData: FormData,
): Promise<ConversionImportState> {
  const intent = intentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return { status: "error", code: "failed" };

  const { user } = await requireAdmin();

  const file = fileSchema.safeParse(formData.get("file"));
  if (!file.success) return { status: "error", code: "file_missing" };
  if (file.data.size > MAX_CONVERSION_BYTES) return { status: "error", code: "file_too_large" };
  if (!file.data.name.toLowerCase().endsWith(".csv")) return { status: "error", code: "file_not_csv" };

  const text = await file.data.text();
  const fileName = file.data.name;

  try {
    const outcome = await dbAdmin.transaction((tx) =>
      intent.data === "preview"
        ? buildConversionImportPreview(tx, fileName, text)
        : commitConversionImport(tx, user.id, fileName, text),
    );
    if (outcome.status === "imported") revalidatePath(DASHBOARD_PATH, "layout");
    return fromOutcome(outcome);
  } catch (error) {
    console.error("conversionImportAction", errorCode(error));
    return { status: "error", code: "failed" };
  }
}
