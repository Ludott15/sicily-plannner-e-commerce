// Stato di caricamento dell'elenco ordini admin: scheletro dei filtri e delle righe.
export default function AdminOrdersLoading() {
  return (
    <section aria-busy="true" className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="h-9 w-40 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
        <div className="h-5 w-2/3 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((field) => (
          <div key={field} className="h-11 rounded-sm bg-calce-sunk motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="flex flex-col border-t border-divider">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-12 border-b border-divider bg-calce-sunk motion-safe:animate-pulse" />
        ))}
      </div>
    </section>
  );
}
