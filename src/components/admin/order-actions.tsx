"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/design";
import type { OrderStatus, SupplierStatus } from "@/lib/shop/orders";
import { Field, FormError, FormNotice, TextArea, TextInput } from "./fields";
import { useOrderAction, type OrderAction, type OrderActionState } from "./use-order-action";

// Azioni admin su un ordine (passo 7.3). Le azioni arrivano come prop dalla pagina (i moduli *.admin.ts non si
// importano dai componenti). Ogni azione mostra il suo esito: il messaggio di errore usa il codice del server.
// Quali azioni compaiono dipende dallo stato: le stesse regole di orders-state.admin.ts.

export type ShipInput = { orderId: string; carrier: string; trackingNumber: string; trackingUrl: string };
export type ProblemInput = { orderId: string; note: string };
export type OrderIdInput = { orderId: string };

export type AdminOrderActions = {
  forward: OrderAction<OrderIdInput>;
  supplierConfirmed: OrderAction<OrderIdInput>;
  ship: OrderAction<ShipInput>;
  delivered: OrderAction<OrderIdInput>;
  problem: OrderAction<ProblemInput>;
  clearReview: OrderAction<OrderIdInput>;
  // Facoltativa: compare quando l'azione del server è disponibile.
  resendLink?: OrderAction<OrderIdInput>;
};

type Props = {
  orderId: string;
  status: OrderStatus;
  supplierStatus: SupplierStatus;
  needsReview: boolean;
  actions: AdminOrderActions;
};

export function OrderAdminActions({ orderId, status, supplierStatus, needsReview, actions }: Props) {
  const t = useTranslations("AdminOrders");
  const canForward = status === "paid" && !needsReview && (supplierStatus === "pending" || supplierStatus === "problem");
  const canConfirm = supplierStatus === "forwarded";
  // La spedizione si registra solo dopo l'inoltro: il fornitore deve aver confermato o almeno ricevuto l'ordine.
  const canShip =
    status === "paid" && !needsReview && (supplierStatus === "forwarded" || supplierStatus === "confirmed");
  const canDeliver = status === "shipped";
  const canReport = status === "paid" || status === "shipped";
  const canResend = (status === "paid" || status === "shipped") && !needsReview && actions.resendLink !== undefined;

  const nothingToDo = !canForward && !canConfirm && !canShip && !canDeliver && !canReport && !needsReview && !canResend;

  return (
    <section aria-labelledby="order-actions" className="flex flex-col gap-6">
      <h2 id="order-actions" className="is-display text-heading-2">
        {t("actionsTitle")}
      </h2>
      {nothingToDo && <p className="text-body-s text-lava-muted">{t("noActions")}</p>}

      {needsReview && (
        <div className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <p className="text-body">{t("reviewNotice")}</p>
          <OrderActionButton
            label={t("clearReview")}
            action={actions.clearReview}
            input={{ orderId }}
            variant="primary"
          />
        </div>
      )}

      {canForward && (
        <div className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <h3 className="text-heading-3">{t("forwardTitle")}</h3>
          <p className="text-body-s text-lava-muted">{t("forwardHint")}</p>
          <OrderActionButton label={t("forward")} action={actions.forward} input={{ orderId }} variant="primary" />
        </div>
      )}

      {canConfirm && (
        <div className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <p className="text-body-s text-lava-muted">{t("confirmHint")}</p>
          <OrderActionButton label={t("supplierConfirmed")} action={actions.supplierConfirmed} input={{ orderId }} />
        </div>
      )}

      {canShip && <ShipForm orderId={orderId} action={actions.ship} />}

      {canDeliver && (
        <div className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <h3 className="text-heading-3">{t("deliveredTitle")}</h3>
          <p className="text-body-s text-lava-muted">{t("deliveredHint")}</p>
          <OrderActionButton label={t("delivered")} action={actions.delivered} input={{ orderId }} variant="primary" />
        </div>
      )}

      {canReport && <ProblemForm orderId={orderId} action={actions.problem} />}

      {canResend && actions.resendLink && (
        <div className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <p className="text-body-s text-lava-muted">{t("resendHint")}</p>
          <OrderActionButton label={t("resendLink")} action={actions.resendLink} input={{ orderId }} />
        </div>
      )}
    </section>
  );
}

// Pulsante di un'azione senza campi. Disabilitato durante il salvataggio per evitare il doppio invio.
function OrderActionButton<Input extends OrderIdInput>({
  label,
  action,
  input,
  variant = "secondary",
}: {
  label: string;
  action: OrderAction<Input>;
  input: Input;
  variant?: "primary" | "secondary";
}) {
  const { state, submit, pending } = useOrderAction(action);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    submit(input);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FeedbackMessages state={state} />
      <div>
        <button type="submit" className={buttonClass(variant)} disabled={pending}>
          {label}
        </button>
      </div>
    </form>
  );
}

function FeedbackMessages({ state }: { state: OrderActionState }) {
  const t = useTranslations("AdminOrders");
  return (
    <>
      <FormError message={state.status === "error" ? t(`errors.${state.code}`) : null} />
      <FormNotice message={state.status === "saved" ? t("saved") : null} />
    </>
  );
}

function ShipForm({ orderId, action }: { orderId: string; action: OrderAction<ShipInput> }) {
  const t = useTranslations("AdminOrders");
  const { state, submit, pending } = useOrderAction(action);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    submit({
      orderId,
      carrier: String(data.get("carrier") ?? ""),
      trackingNumber: String(data.get("trackingNumber") ?? ""),
      trackingUrl: String(data.get("trackingUrl") ?? ""),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <h3 className="text-heading-3">{t("shipTitle")}</h3>
      <p className="text-body-s text-lava-muted">{t("shipHint")}</p>
      <FeedbackMessages state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("carrier")} htmlFor={`ship-carrier-${orderId}`}>
          <TextInput id={`ship-carrier-${orderId}`} name="carrier" required maxLength={80} />
        </Field>
        <Field label={t("trackingNumber")} htmlFor={`ship-tracking-${orderId}`}>
          <TextInput id={`ship-tracking-${orderId}`} name="trackingNumber" required maxLength={120} />
        </Field>
        <Field label={t("trackingUrl")} htmlFor={`ship-url-${orderId}`} hint={t("trackingUrlHint")}>
          <TextInput id={`ship-url-${orderId}`} name="trackingUrl" type="url" maxLength={500} />
        </Field>
      </div>
      <div>
        <button type="submit" className={buttonClass("primary")} disabled={pending}>
          {t("shipSubmit")}
        </button>
      </div>
    </form>
  );
}

function ProblemForm({ orderId, action }: { orderId: string; action: OrderAction<ProblemInput> }) {
  const t = useTranslations("AdminOrders");
  const { state, submit, pending } = useOrderAction(action);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    submit({ orderId, note: String(data.get("note") ?? "") });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
      <h3 className="text-heading-3">{t("problemTitle")}</h3>
      <p className="text-body-s text-lava-muted">{t("problemHint")}</p>
      <FeedbackMessages state={state} />
      <Field label={t("problemNote")} htmlFor={`problem-note-${orderId}`}>
        <TextArea id={`problem-note-${orderId}`} name="note" required maxLength={1000} />
      </Field>
      <div>
        <button type="submit" className={buttonClass("secondary")} disabled={pending}>
          {t("problemSubmit")}
        </button>
      </div>
    </form>
  );
}
