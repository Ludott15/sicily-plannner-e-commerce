"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

// Form del builder con azione server che può rispondere con un errore (stesso schema di
// useAdminForm): l'azione parte da onSubmit, senza reset dei campi, così l'utente non perde
// quello che ha scritto. "submitted" dice se l'utente ha già inviato il form: il messaggio di
// esito non compare al primo render, quando lo stato è ancora quello iniziale.
export function useTripForm<S extends { status: string }>(
  action: (prev: Awaited<S>, formData: FormData) => Promise<S>,
  initial: Awaited<S>,
) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitted(true);
    startTransition(() => dispatch(data));
  }

  return { state, submitted, pending, submit };
}
