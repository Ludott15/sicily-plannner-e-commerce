// Stato di caricamento dell'elenco degli ordini: scheletro con la forma delle righe.
export default function MyOrdersLoading() {
  return (
    <section aria-busy="true" className="mx-auto flex w-full max-w-[680px] flex-col gap-10 px-4 py-8 md:gap-12 md:px-16 md:py-12">
      <div className="flex flex-col gap-3">
        <div className="h-9 w-48 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
        <div className="h-5 w-3/4 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
      </div>
      <ul className="flex flex-col border-t border-divider">
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex flex-col gap-2 border-b border-divider py-4">
            <div className="h-5 w-40 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
            <div className="h-4 w-2/3 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>
    </section>
  );
}
