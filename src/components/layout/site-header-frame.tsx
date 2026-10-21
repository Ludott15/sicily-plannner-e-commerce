"use client";

import { useEffect, useState, type ReactNode } from "react";

// Intestazione sticky: in cima non ha bordo; appena la pagina scorre compare il bordo sottile
// (divider). Solo lo stato del bordo cambia, nessuna animazione: il movimento è ridotto per scelta.
export function SiteHeaderFrame({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 border-b bg-calce ${scrolled ? "border-divider" : "border-transparent"}`}
      data-scrolled={scrolled ? "true" : undefined}
    >
      {children}
    </header>
  );
}
