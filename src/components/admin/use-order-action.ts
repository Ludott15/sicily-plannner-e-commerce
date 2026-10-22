"use client";

import { startTransition, useActionState } from "react";

// Azioni sugli ordini (passo 7.3): input oggetto, esito { status: "ok" } | { status: "error", code }.
// Come useAdminForm e useEditorialAction, l'azione parte da un evento con startTransition e non da <form action>:
// React 19 non azzera i campi dopo un errore e l'admin non perde quello che ha scritto.

export type OrderActionCode = "invalid" | "not_found" | "invalid_state" | "needs_review" | "not_clearable" | "failed";
export type OrderActionResult = { status: "ok" } | { status: "error"; code: OrderActionCode };
export type OrderActionState = { status: "idle" } | { status: "saved" } | { status: "error"; code: OrderActionCode };
export type OrderAction<Input> = (input: Input) => Promise<OrderActionResult>;

const IDLE: OrderActionState = { status: "idle" };

export function useOrderAction<Input>(action: OrderAction<Input>) {
  const [state, dispatch, pending] = useActionState(
    async (_previous: OrderActionState, input: Input): Promise<OrderActionState> => {
      const result = await action(input);
      return result.status === "ok" ? { status: "saved" } : { status: "error", code: result.code };
    },
    IDLE,
  );

  function submit(input: Input) {
    startTransition(() => dispatch(input));
  }

  return { state, submit, pending };
}
