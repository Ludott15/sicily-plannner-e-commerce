// Stato di caricamento di una sezione del gruppo: blocchi calce-sunk che pulsano (solo con
// motion-safe), con un testo per chi legge lo schermo. Nessun colore scritto a mano.
export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <div className="h-7 w-48 rounded-lg bg-calce-sunk" />
        <div className="h-4 w-full max-w-md rounded-lg bg-calce-sunk" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-48 rounded-lg bg-calce-sunk" />
          <div className="h-48 rounded-lg bg-calce-sunk" />
          <div className="h-48 rounded-lg bg-calce-sunk" />
        </div>
      </div>
    </div>
  );
}
