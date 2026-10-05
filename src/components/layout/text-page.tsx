import type { ReactNode } from "react";

// Pagina di testo (Chi siamo, Link affiliati, pagine legali): colonna di lettura, titolo
// display, sezioni con titoli heading-2.
export function TextPage({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 md:px-8 md:py-16">
      {eyebrow && <p className="text-label uppercase text-lava-muted">{eyebrow}</p>}
      <h1 className="is-display mt-2 text-display-l">{title}</h1>
      {intro && <p className="mt-4 text-body-l text-pretty text-lava-muted">{intro}</p>}
      <div className="mt-10 flex flex-col gap-10">{children}</div>
    </article>
  );
}

export function TextSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="is-display text-heading-2">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-body-l text-pretty">{children}</div>
    </section>
  );
}
