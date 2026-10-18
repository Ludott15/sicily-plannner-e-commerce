"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Dialog modale accessibile (generalizza il vecchio ConfirmDialog). È un <dialog> aperto con
// showModal: il focus resta dentro, Escape lo chiude e il focus torna al pulsante che l'ha aperto.
// Il contenuto si monta solo quando è aperto, così i campi nascosti si leggono all'apertura.
// Il titolo è obbligatorio (aria-labelledby); la descrizione è facoltativa.
export type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      className="w-[min(92vw,28rem)] rounded-lg border border-card-edge bg-calce-raised p-6 text-lava shadow-card backdrop:bg-calce/70"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 id={titleId} className="text-heading-3">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-body-s text-lava-muted">
                {description}
              </p>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
