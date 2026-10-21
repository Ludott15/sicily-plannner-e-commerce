"use client";

import { useState, type ReactNode } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

// Superficie unica delle finestre dell'header (docs/design/components/Popover/README.md).
// Desktop: pannello ancorato al suo pulsante, allineato al bordo scelto con `align`.
// Mobile (sotto 768px): sheet dal basso con maniglia, grazie alle regole di controls.css.
// Esc, clic fuori e × chiudono; il focus resta nel pannello (modal "trap-focus") e torna al
// pulsante alla chiusura. Il contenuto scorre; il piede ospita le azioni.

export type PopoverProps = {
  // Contenuto del pulsante (icona con badge, testo).
  trigger: ReactNode;
  // Nome accessibile del pulsante, per i pulsanti con sola icona.
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  align?: "start" | "end";
  children: ReactNode;
  // Azioni del piede. `close` chiude il pannello (per "Continua" e simili).
  footer?: (close: () => void) => ReactNode;
};

export function Popover({
  trigger,
  triggerLabel,
  triggerClassName,
  title,
  align = "end",
  children,
  footer,
}: PopoverProps) {
  const t = useTranslations("Controls");
  const [open, setOpen] = useState<boolean>(false);
  const close = () => setOpen(false);

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen} modal="trap-focus">
      <BasePopover.Trigger aria-label={triggerLabel} className={triggerClassName}>
        {trigger}
      </BasePopover.Trigger>

      <BasePopover.Portal>
        <BasePopover.Positioner
          className="is-overlay is-popover__positioner"
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
        >
          <BasePopover.Popup className="is-panel is-popover">
            <span className="is-sheet-handle" aria-hidden="true" />
            <div className="is-popover__head">
              <BasePopover.Title className="is-popover__title">{title}</BasePopover.Title>
              <BasePopover.Close aria-label={t("close")} className="is-icon-btn">
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </BasePopover.Close>
            </div>
            <div className="is-popover__body">{children}</div>
            {footer && <div className="is-popover__foot">{footer(close)}</div>}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
