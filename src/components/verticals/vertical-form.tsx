import type { ReactNode } from "react";
import { buttonClass } from "@/components/design";
import { cn } from "@/lib/utils";

// Form di ricerca di una verticale: GET verso la stessa pagina, così il riepilogo e il link firmato
// si ricalcolano sul server dai parametri dell'URL. I campi usano i controlli del design system
// (Select, DateField o input .is-field) e passano il loro `name`; `hidden` porta i parametri che non
// si vedono (partner scelto, tipo di alloggio) senza perderli al nuovo invio.

type VerticalFormProps = {
  submitLabel: string;
  hidden?: Record<string, string>;
  children: ReactNode;
};

export function VerticalForm({ submitLabel, hidden, children }: VerticalFormProps) {
  return (
    <form method="get" className="grid gap-4 rounded-lg border border-card-edge bg-calce-raised p-6 md:grid-cols-2 lg:grid-cols-4">
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value === "" ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      {children}
      <div className="flex items-end md:col-span-2 lg:col-span-4">
        <button type="submit" className={buttonClass("primary", "md", "w-full md:w-auto")}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

type VerticalFieldProps = {
  label: string;
  // Con un campo nativo (input) si collega la label; con Select e DateField il nome accessibile è
  // quello del controllo, quindi qui si passa solo il testo visibile.
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
};

export function VerticalField({ label, htmlFor, wide = false, children }: VerticalFieldProps) {
  const className = cn("flex min-w-0 flex-col gap-1.5", wide && "lg:col-span-2");
  return htmlFor ? (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-body-s font-semibold">
        {label}
      </label>
      {children}
    </div>
  ) : (
    <div className={className}>
      <span className="text-body-s font-semibold">{label}</span>
      {children}
    </div>
  );
}
