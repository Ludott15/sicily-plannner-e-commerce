"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { AdminFormAction } from "@/lib/admin-form";

// Form dell'admin con azione server. React 19 azzera i campi dopo un'azione passata a
// <form action>: con un errore l'admin perderebbe quello che ha scritto. Qui l'azione
// parte da onSubmit, senza reset, così i valori restano accanto al messaggio d'errore.
export function useAdminForm(action: AdminFormAction) {
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }
  return { state, onSubmit, pending };
}
