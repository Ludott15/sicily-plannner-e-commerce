"use client";

import { startTransition, useActionState, useState } from "react";

// Azione server con esito tipizzato (ok, errore con codice, o uno stato proprio) e payload
// tipizzato. Come useTripForm: l'azione parte da run(), chiamata da onSubmit o da onClick, mai
// da <form action>, così i campi restano dopo un errore. "submitted" dice se l'utente ha già
// inviato: il messaggio di esito non compare al primo render.
export function useGroupAction<P, S extends { status: string }>(
  action: (prev: Awaited<S>, payload: P) => Promise<S>,
  initial: Awaited<S>,
) {
  const [state, dispatch, pending] = useActionState<S, P>(action, initial);
  const [submitted, setSubmitted] = useState(false);

  function run(payload: P) {
    setSubmitted(true);
    startTransition(() => dispatch(payload));
  }

  return { state, pending, submitted, run };
}
