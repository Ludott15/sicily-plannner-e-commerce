// Stato di caricamento dell'invito: scheletro con la forma della card centrata (anteprima e azione).
export default function InviteLoading() {
  return (
    <section
      aria-busy="true"
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-8 md:py-16"
    >
      <div className="flex flex-col gap-6 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card md:p-8">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-32 rounded-pill bg-calce-sunk motion-safe:animate-pulse" />
          <div className="h-9 w-3/4 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
          <div className="h-5 w-2/3 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
          <div className="h-4 w-1/2 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
        </div>
        <div className="flex flex-col gap-3 border-t border-divider pt-6">
          <div className="h-6 w-40 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
          <div className="h-4 w-full rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
          <div className="h-4 w-5/6 rounded-lg bg-calce-sunk motion-safe:animate-pulse" />
        </div>
        <div className="h-11 w-40 rounded-pill bg-calce-sunk motion-safe:animate-pulse" />
      </div>
    </section>
  );
}
