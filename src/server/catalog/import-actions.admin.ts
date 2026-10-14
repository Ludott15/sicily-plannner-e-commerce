"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_IMPORT_BYTES } from "@/lib/catalog-import/columns";
import type { CatalogImportFileError, CatalogImportResult, CatalogImportPreview } from "@/lib/catalog-import/types";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, adminAuditLog } from "@/server/db/schema";
import { buildCatalogImportPreview, commitCatalogImport } from "./import.admin";

// Importazione CSV del catalogo e verifica delle attività dalla coda "Da verificare".
// Zod → requireAdmin → lettura del file → parsing e risoluzione (nel modulo import.admin.ts).

const CATALOG_PATH = "/[locale]/admin/attivita";

export type CatalogImportState =
  | { status: "idle" }
  | { status: "preview"; preview: CatalogImportPreview }
  | { status: "imported"; result: CatalogImportResult }
  | { status: "error"; code: CatalogImportFileError | "failed"; columns?: string[] };

const intentSchema = z.enum(["preview", "commit"]);
const fileSchema = z.instanceof(File);
const idSchema = z.uuid();

// Codice del DB (es. 23505) per il log: mai il messaggio, che può contenere valori del file.
function errorCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

export async function catalogImportAction(_prev: CatalogImportState, formData: FormData): Promise<CatalogImportState> {
  const intent = intentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return { status: "error", code: "failed" };
  const file = fileSchema.safeParse(formData.get("file"));
  if (!file.success) return { status: "error", code: "file_missing" };
  if (file.data.size > MAX_IMPORT_BYTES) return { status: "error", code: "file_too_large" };
  if (!file.data.name.toLowerCase().endsWith(".csv")) return { status: "error", code: "file_not_csv" };

  const { user } = await requireAdmin();
  const text = await file.data.text();
  const fileName = file.data.name;

  try {
    const outcome = await dbAdmin.transaction((tx) =>
      intent.data === "preview"
        ? buildCatalogImportPreview(tx, fileName, text)
        : commitCatalogImport(tx, user.id, fileName, text),
    );
    if (outcome.status === "imported") revalidatePath(CATALOG_PATH, "layout");
    return outcome;
  } catch (error) {
    console.error("catalogImportAction", errorCode(error));
    return { status: "error", code: "failed" };
  }
}

// Segna un'attività come verificata. Se era già verificata non si scrive nulla nel registro.
export async function verifyActivity(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return;
  const { user } = await requireAdmin();
  const id = parsed.data;

  try {
    await dbAdmin.transaction(async (tx) => {
      const updated = await tx
        .update(activities)
        .set({ needsReview: false })
        .where(and(eq(activities.id, id), eq(activities.needsReview, true)))
        .returning({ id: activities.id });
      if (updated.length === 0) return;
      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "activity.verify",
        entity: "activities",
        entityId: id,
        diff: { needs_review: [true, false] },
      });
    });
  } catch (error) {
    console.error("verifyActivity", errorCode(error));
    return;
  }
  revalidatePath(CATALOG_PATH, "layout");
}
