"use client";

import { startTransition, useActionState, type FormEvent } from "react";

// Azioni editoriali (guide e aree): contratto { status: "ok", id? } | { status: "error", code }.
// Come useAdminForm: l'azione parte da onSubmit con startTransition e non da <form action>, così
// React 19 non azzera i campi dopo un errore e l'admin non perde il testo già scritto.

export type EditorialResult = { status: "ok"; id?: string } | { status: "error"; code: string };
export type EditorialState = { status: "idle" } | { status: "saved"; id?: string } | { status: "error"; code: string };
export type EditorialAction = (formData: FormData) => Promise<EditorialResult>;

const IDLE: EditorialState = { status: "idle" };

export function useEditorialAction(action: EditorialAction) {
  const [state, dispatch, pending] = useActionState(
    async (_previous: EditorialState, formData: FormData): Promise<EditorialState> => {
      const result = await action(formData);
      return result.status === "ok" ? { status: "saved", id: result.id } : { status: "error", code: result.code };
    },
    IDLE,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return { state, onSubmit, pending };
}
