"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Menu a tendina del sito, su Base UI Select (docs/design/components/Select/README.md).
// Sostituisce il <select> nativo in ogni form: un input nascosto con `name` porta il valore nelle form
// GET e nelle azioni server, quindi `name`, `defaultValue` e `required` si comportano come prima.
// Il nome accessibile è `label` (aria-label del trigger); il testo visibile, se serve, lo scrive
// il chiamante con un <label htmlFor={id}>, come nei form esistenti.

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type SelectProps = {
  id?: string;
  name?: string;
  label?: string;
  options: readonly SelectOption[];
  // Controllato: passare value e onValueChange. Non controllato: defaultValue.
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  size?: "md" | "sm";
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function Select({
  id,
  name,
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  required = false,
  size = "md",
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SelectProps) {
  const items = options.map((option) => ({ label: option.label, value: option.value }));
  const controlled = value !== undefined;
  // Il popup va nel dialog nativo che contiene il campo: un portale nel body starebbe sotto il top layer.
  const dialogRef = useRef<HTMLElement | null>(null);
  function trackDialog(node: HTMLButtonElement | null) {
    dialogRef.current = node?.closest("dialog") ?? null;
  }

  return (
    <BaseSelect.Root<string>
      id={id}
      name={name}
      items={items}
      disabled={disabled}
      required={required}
      {...(controlled ? { value } : { defaultValue: defaultValue ?? null })}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
    >
      <BaseSelect.Trigger
        ref={trackDialog}
        aria-label={label}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn("is-field is-select", size === "sm" && "is-field--sm", className)}
      >
        <BaseSelect.Value placeholder={placeholder} className="is-select__value" />
        <BaseSelect.Icon className="is-select__icon">
          <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal container={dialogRef}>
        <BaseSelect.Positioner
          className="is-overlay"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="is-panel is-select__popup">
            <BaseSelect.List className="is-select__list">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  aria-label={option.label}
                  disabled={option.disabled}
                  className="is-select__item"
                >
                  <span className="is-select__copy">
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    {option.description && <span className="is-select__desc">{option.description}</span>}
                  </span>
                  <BaseSelect.ItemIndicator className="is-select__check">
                    <Check size={18} strokeWidth={1.5} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
