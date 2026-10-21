"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { runOrderEffects } from "./order-effects.admin";
import {
  clearReviewTx,
  deliverOrderTx,
  markForwardedTx,
  markProblemTx,
  markSupplierConfirmedTx,
  shipOrderTx,
  type TransitionResult,
} from "./orders-state.admin";

// Azioni admin sugli ordini (passo 7.3). Ordine: validazione Zod → requireAdmin → una transazione dbAdmin
// (lo stato cambia e si scrive admin_audit_log nella stessa transazione) → effetti dopo il commit (email,
// inoltro). La UI (/admin/ordini) le chiama con onSubmit + startTransition (vedi use-admin-form.ts).
// Esito: { status: "ok" } oppure { status: "error", code }, come le azioni dello shop (7.2).

export type AdminOrderActionCode =
  | "invalid"
  | "not_found"
  | "invalid_state"
  | "needs_review"
  | "failed";

export type AdminOrderActionResult = { status: "ok" } | { status: "error"; code: AdminOrderActionCode };

const orderIdSchema = z.object({ orderId: z.uuid() });

const shipSchema = z.object({
  orderId: z.uuid(),
  carrier: z.string().trim().min(1).max(80),
  trackingNumber: z.string().trim().min(1).max(120),
  trackingUrl: z
    .union([z.literal(""), z.url({ protocol: /^https$/ })])
    .nullish()
    .transform((value) => (value === "" || value === undefined ? null : value)),
});

const problemSchema = z.object({
  orderId: z.uuid(),
  note: z.string().trim().min(1).max(1000),
});

const PATH = "/[locale]/admin/ordini";

async function finish(result: TransitionResult): Promise<AdminOrderActionResult> {
  if (!result.ok) return { status: "error", code: result.code };
  await runOrderEffects(result.effects);
  revalidatePath(PATH, "layout");
  return { status: "ok" };
}

// Esegue una transazione admin. Un errore del database non esce al client: si registra il codice.
async function run(action: string, work: () => Promise<TransitionResult>): Promise<AdminOrderActionResult> {
  try {
    return await finish(await work());
  } catch (error) {
    console.error("order_action_failed", {
      action,
      name: error instanceof Error ? error.name : "unknown",
    });
    return { status: "error", code: "failed" };
  }
}

// Segna l'ordine come inoltrato a mano (portale del fornitore o telefono).
export async function markOrderForwardedAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  return run("forwarded", () =>
    dbAdmin.transaction((tx) =>
      markForwardedTx(tx, { orderId: parsed.data.orderId, actorId: user.id, now: new Date() }),
    ),
  );
}

// Il fornitore ha confermato l'ordine.
export async function markOrderSupplierConfirmedAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  return run("supplier_confirmed", () =>
    dbAdmin.transaction((tx) => markSupplierConfirmedTx(tx, { orderId: parsed.data.orderId, actorId: user.id })),
  );
}

// Spedito: corriere e tracking. Il cliente riceve l'email con il link di tracciamento.
export async function shipOrderAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  const data = parsed.data;
  return run("shipped", () =>
    dbAdmin.transaction((tx) =>
      shipOrderTx(tx, {
        orderId: data.orderId,
        actorId: user.id,
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        now: new Date(),
      }),
    ),
  );
}

// Consegnato: stato delivered e punti (1 per euro), una volta sola.
export async function markOrderDeliveredAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  return run("delivered", () =>
    dbAdmin.transaction((tx) => deliverOrderTx(tx, { orderId: parsed.data.orderId, actorId: user.id, now: new Date() })),
  );
}

// Problema con l'ordine, con una nota obbligatoria.
export async function reportOrderProblemAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = problemSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  return run("problem", () =>
    dbAdmin.transaction((tx) =>
      markProblemTx(tx, { orderId: parsed.data.orderId, actorId: user.id, note: parsed.data.note }),
    ),
  );
}

// Revisione conclusa (importo verificato): l'ordine riceve la conferma al cliente.
export async function clearOrderReviewAction(input: unknown): Promise<AdminOrderActionResult> {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  return run("review_cleared", () =>
    dbAdmin.transaction((tx) => clearReviewTx(tx, { orderId: parsed.data.orderId, actorId: user.id })),
  );
}
