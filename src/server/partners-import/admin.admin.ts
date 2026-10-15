"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activityInterests, activityTagProposals, adminAuditLog, partnerImportRuns } from "@/server/db/schema";
import { createAdapters, IMPORT_PARTNERS } from "./adapters";
import { runPartnerImport } from "./run.admin";
import type { ActionResponse, PartnerName } from "./types";

// Pagina /admin/import-partner e banner della home admin. Ogni funzione verifica l'admin
// (requireAdmin) prima di leggere o scrivere. "Esegui ora" usa la stessa funzione del cron.

const IMPORT_PATH = "/[locale]/admin/import-partner";
const CATALOG_PATH = "/[locale]/admin/attivita";
const RUNS_SHOWN = 10;
// Avviso se le ultime due esecuzioni di un partner configurato sono fallite.
const ALERT_AFTER_FAILURES = 2;

export type PartnerImportRunView = {
  startedAt: string;
  finishedAt: string | null;
  status: "ok" | "failed";
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
  skippedCount: number;
  error: string | null;
};

export type PartnerImportStatus = {
  partner: PartnerName;
  configured: boolean;
  runs: PartnerImportRunView[];
  alert: boolean;
};

export type ImportNowSummary = {
  partner: PartnerName;
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
  skippedCount: number;
  newActivities: number;
  tagsProposed: number;
};

const runNowSchema = z.object({ partner: z.enum(IMPORT_PARTNERS) });
const activityIdSchema = z.uuid();

// Codice DB per il log: mai il messaggio, che può contenere valori dei dati.
function errorCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

// Stato di ogni partner: ultime esecuzioni e avviso. "configured" dice se la chiave c'è.
export async function adminPartnerImportStatus(): Promise<PartnerImportStatus[]> {
  await requireAdmin();
  const configured = new Set(createAdapters().filter((adapter) => adapter.isConfigured()).map((a) => a.partner));
  const statuses: PartnerImportStatus[] = [];
  for (const partner of IMPORT_PARTNERS) {
    const rows = await dbAdmin
      .select({
        startedAt: partnerImportRuns.startedAt,
        finishedAt: partnerImportRuns.finishedAt,
        status: partnerImportRuns.status,
        createdCount: partnerImportRuns.createdCount,
        updatedCount: partnerImportRuns.updatedCount,
        deactivatedCount: partnerImportRuns.deactivatedCount,
        skippedCount: partnerImportRuns.skippedCount,
        error: partnerImportRuns.error,
      })
      .from(partnerImportRuns)
      .where(eq(partnerImportRuns.partner, partner))
      .orderBy(desc(partnerImportRuns.startedAt))
      .limit(RUNS_SHOWN);

    const runs: PartnerImportRunView[] = rows.map((row) => ({
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      status: row.status === "ok" ? "ok" : "failed",
      createdCount: row.createdCount,
      updatedCount: row.updatedCount,
      deactivatedCount: row.deactivatedCount,
      skippedCount: row.skippedCount,
      error: row.error,
    }));
    const lastRuns = runs.slice(0, ALERT_AFTER_FAILURES);
    const alert =
      configured.has(partner) && lastRuns.length === ALERT_AFTER_FAILURES && lastRuns.every((run) => run.status === "failed");
    statuses.push({ partner, configured: configured.has(partner), runs, alert });
  }
  return statuses;
}

// Partner da segnalare nel banner della home admin.
export async function adminImportAlertPartners(): Promise<PartnerName[]> {
  const statuses = await adminPartnerImportStatus();
  return statuses.filter((status) => status.alert).map((status) => status.partner);
}

// "Esegui ora": Zod, poi requireAdmin, poi la stessa funzione del cron.
export async function runImportNow(input: unknown): Promise<ActionResponse<ImportNowSummary>> {
  const parsed = runNowSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Partner non valido.", code: "invalid_input", fieldErrors: { partner: ["Partner non valido."] } };
  }
  await requireAdmin();
  const partner = parsed.data.partner;
  const outcome = await runPartnerImport(partner);
  revalidatePath(IMPORT_PATH, "layout");
  revalidatePath(CATALOG_PATH, "layout");

  if (outcome.status === "unconfigured") {
    return { success: false, error: "Partner non configurato: manca la chiave API.", code: "unconfigured" };
  }
  if (outcome.status === "failed") {
    return { success: false, error: "Import non riuscito. Vedi l'ultima esecuzione.", code: outcome.error };
  }
  return {
    success: true,
    data: {
      partner,
      createdCount: outcome.counts.createdCount,
      updatedCount: outcome.counts.updatedCount,
      deactivatedCount: outcome.counts.deactivatedCount,
      skippedCount: outcome.counts.skippedCount,
      newActivities: outcome.newActivities,
      tagsProposed: outcome.tagsProposed,
    },
    message: "Import completato.",
  };
}

// "Conferma tag": le proposte diventano tag dell'attività, le proposte si cancellano, audit.
export async function confirmProposedTags(activityId: unknown): Promise<ActionResponse<{ activityId: string; tags: number }>> {
  const parsed = activityIdSchema.safeParse(activityId);
  if (!parsed.success) return { success: false, error: "Attività non valida.", code: "invalid_input" };
  const { user } = await requireAdmin();
  const id = parsed.data;

  try {
    const confirmed = await dbAdmin.transaction(async (tx) => {
      const proposals = await tx
        .select({ interestKey: activityTagProposals.interestKey, strength: activityTagProposals.strength })
        .from(activityTagProposals)
        .where(eq(activityTagProposals.activityId, id));
      if (proposals.length === 0) return 0;

      await tx
        .insert(activityInterests)
        .values(proposals.map((p) => ({ activityId: id, interestKey: p.interestKey, strength: p.strength })))
        .onConflictDoNothing();
      await tx.delete(activityTagProposals).where(eq(activityTagProposals.activityId, id));
      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "activity.tags_confirm",
        entity: "activities",
        entityId: id,
        diff: { interests: proposals.map((p) => [p.interestKey, p.strength]) },
      });
      return proposals.length;
    });
    if (confirmed === 0) return { success: false, error: "Nessuna proposta da confermare.", code: "no_proposals" };
    revalidatePath(CATALOG_PATH, "layout");
    revalidatePath(IMPORT_PATH, "layout");
    return { success: true, data: { activityId: id, tags: confirmed }, message: "Tag confermati." };
  } catch (error) {
    console.error("confirmProposedTags", errorCode(error));
    return { success: false, error: "Operazione non riuscita.", code: "failed" };
  }
}
