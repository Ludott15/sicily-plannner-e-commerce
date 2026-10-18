import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Piccoli pezzi condivisi dai moduli del builder: controlli con i token (bordo border-control,
// 44px di altezza, testo da 16px) ed esiti dei form.

export const controlClass =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava placeholder:text-lava-muted";

export const textareaClass = cn(controlClass, "min-h-24 py-2");

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-body-s font-semibold">
      {children}
    </label>
  );
}

// Errore di un'azione: role="alert" sul messaggio, mai sui campi (restano accanto).
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body-s text-danger">
      {message}
    </p>
  );
}

// Esito positivo accanto al form. aria-live e non role="status": quel ruolo è della live region
// del trascinamento (dnd-kit).
export function SavedNote({ message }: { message: string | null }) {
  return (
    <p aria-live="polite" className="text-body-s text-lava-muted">
      {message ?? ""}
    </p>
  );
}
