import { notFound } from "next/navigation";

// Percorsi che non esistono sotto /it e /en: la 404 localizzata di [locale]/not-found.tsx.
export default function CatchAll() {
  notFound();
}
