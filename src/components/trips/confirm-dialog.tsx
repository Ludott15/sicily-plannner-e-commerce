"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Dialog di conferma accessibile: è un <dialog> aperto in modale, quindi il focus resta dentro,
// Escape lo chiude e il focus torna al pulsante che l'ha aperto. Il contenuto si monta solo
// quando è aperto (i campi nascosti si leggono al momento dell'apertura).
export function ConfirmDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      onClose={onClose}
      className="w-[min(92vw,28rem)] rounded-lg border border-card-edge bg-calce-raised p-6 text-lava shadow-card backdrop:bg-calce/70"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-heading-3">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
