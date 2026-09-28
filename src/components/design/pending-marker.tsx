import { pendingAttributes, type PendingId } from "@/lib/pending-actions";

// Elemento del mockup in sospeso che resta nascosto finché la funzione non esiste
// (src/lib/pending-actions.ts): in pagina c'è solo il segnaposto, invisibile e fuori
// dall'albero di accessibilità, che l'e2e confronta con l'elenco.
export function PendingMarker({ id }: { id: PendingId }) {
  return <span hidden {...pendingAttributes(id)} />;
}
