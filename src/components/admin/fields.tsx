import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Campi dei form dell'admin: controlli nativi con i token (bordo border-control, 44px di
// altezza, testo da 16px), etichetta sempre visibile e suggerimento sotto.

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

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
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
