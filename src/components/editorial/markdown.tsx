import { Fragment, type ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import type { MdBlock, MdInline } from "@/lib/markdown";

// Render del Markdown ridotto prodotto da parseMarkdown (src/lib/markdown.ts). Niente HTML grezzo e
// niente dangerouslySetInnerHTML: ogni nodo diventa un elemento React. I link interni (percorsi che
// iniziano con /) passano da Link di next-intl, quindi restano nella lingua della pagina; quelli
// esterni si aprono in una scheda nuova. Le immagini non esistono in questo formato: le foto
// passano dal media con i crediti (docs/IMMAGINI.md).
// Il componente non ha stato né effetti: funziona nei Server Component e nell'anteprima dell'admin.

function renderInline(nodes: MdInline[], keyPrefix: string): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return <Fragment key={key}>{node.text}</Fragment>;
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(node.children, key)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "link": {
        const content = renderInline(node.children, key);
        const isInternal = node.href.startsWith("/") && !node.href.startsWith("//");
        if (isInternal) {
          // Il percorso è senza lingua: Link la aggiunge. Un prefisso /it o /en scritto nel testo si toglie.
          const href = node.href.replace(/^\/(it|en)(?=\/|$)/, "") || "/";
          return (
            <Link key={key} href={href} className="font-semibold text-coccio-text underline underline-offset-4">
              {content}
            </Link>
          );
        }
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-coccio-text underline underline-offset-4">
            {content}
          </a>
        );
      }
    }
  });
}

export function Markdown({ blocks }: { blocks: MdBlock[] }) {
  return (
    <div className="flex flex-col gap-5 text-body-l text-pretty">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        switch (block.kind) {
          case "h2":
            return (
              <h2 key={key} className="is-display mt-4 text-heading-2">
                {renderInline(block.children, key)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} className="is-display mt-2 text-heading-3">
                {renderInline(block.children, key)}
              </h3>
            );
          case "p":
            return <p key={key}>{renderInline(block.children, key)}</p>;
          case "ul":
            return (
              <ul key={key} className="flex list-disc flex-col gap-2 pl-6 marker:text-coccio-text">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="flex list-decimal flex-col gap-2 pl-6 marker:text-coccio-text">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
