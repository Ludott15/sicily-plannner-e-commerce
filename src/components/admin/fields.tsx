import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { DateField, Select as DesignSelect, type SelectOption } from "@/components/design";
import { cn } from "@/lib/utils";

// Campi dei form dell'admin: controlli del design system (bordo border-control, 44px di altezza,
// testo da 16px), etichetta sempre visibile e suggerimento sotto. Select e DateInput sostituiscono
// i controlli nativi: i chiamanti restano quelli di prima. Select accetta ancora i figli <option>,
// convertiti in opzioni; il valore scelto arriva in onValueChange (stringa), non come evento.

const control =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava placeholder:text-lava-muted";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body-s font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption text-lava-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2", className)} {...props} />;
}

type SelectFieldProps = {
  id?: string;
  name?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  // Valore iniziale (form non controllato) o valore controllato con onValueChange.
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  children: ReactNode;
};

export function Select({
  id,
  name,
  className,
  required,
  disabled,
  defaultValue,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  children,
}: SelectFieldProps) {
  const options = optionsFromChildren(children);
  // Come il <select> nativo: se il valore non corrisponde a nessuna opzione, mostra la prima.
  const firstEnabled = options.find((option) => !option.disabled)?.value;
  const isKnown = (candidate: string | null | undefined) =>
    candidate !== undefined && candidate !== null && options.some((option) => option.value === candidate);
  return (
    <DesignSelect
      id={id}
      name={name}
      label={ariaLabel}
      options={options}
      defaultValue={isKnown(defaultValue) ? (defaultValue ?? undefined) : firstEnabled}
      value={value === undefined ? undefined : isKnown(value) ? value : (firstEnabled ?? value)}
      onValueChange={onValueChange}
      required={required}
      disabled={disabled}
      className={className}
    />
  );
}

// Data dei form dell'admin (ISO YYYY-MM-DD) sul calendario del design system.
export function DateInput({
  id,
  name,
  className,
  required,
  min,
  max,
  defaultValue,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  className?: string;
  required?: boolean;
  min?: string;
  max?: string;
  defaultValue?: string | null;
  "aria-label"?: string;
}) {
  return (
    <DateField
      id={id}
      name={name}
      label={ariaLabel}
      className={className}
      required={required}
      min={min}
      max={max}
      defaultValue={defaultValue ?? undefined}
    />
  );
}

// Converte i figli <option> in opzioni del design system. Il valore è l'attributo value, o il testo
// se manca, come farebbe il browser. Un <optgroup> diventa le sue opzioni, con il nome del gruppo
// come descrizione (il menu del design system non ha gruppi).
function optionsFromChildren(children: ReactNode, group?: string): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ label?: string; value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === "optgroup") {
      options.push(...optionsFromChildren(child.props.children, child.props.label));
      return;
    }
    const label = textOf(child.props.children);
    options.push({
      value: child.props.value === undefined ? label : String(child.props.value),
      label,
      description: group,
      disabled: child.props.disabled,
    });
  });
  return options;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

export function Checkbox({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-body">
      <input type="checkbox" className="size-5 accent-lava" {...props} />
      {label}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
      <span className="font-semibold text-danger">{message}</span>
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-sm border-[1.5px] border-success bg-calce-raised px-4 py-3 text-body">
      {message}
    </p>
  );
}
