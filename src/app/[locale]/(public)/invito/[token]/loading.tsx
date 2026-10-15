// Stato di caricamento dell'invito: scheletro con la forma dell'anteprima.
export default function InviteLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-4 py-8 md:py-12">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-32 rounded-pill bg-calce-sunk motion-safe:animate-pulse" />
        <div className="h-12 w-3/4 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
        <div className="h-10 w-2/3 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
      </div>
      <div className="h-40 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
    </div>
  );
}
