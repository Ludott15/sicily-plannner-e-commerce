import { describe, expect, it } from "vitest";
import { isSafeHref, parseMarkdown, type MdBlock, type MdInline } from "./markdown";

// Testo di un elenco di nodi inline, per confrontare senza ripetere l'albero.
function plain(nodes: MdInline[]): string {
  return nodes
    .map((node) => (node.kind === "text" ? node.text : plain(node.children)))
    .join("");
}

// Testo di un blocco di paragrafo o titolo.
function blockText(block: MdBlock | undefined): string {
  if (!block || !("children" in block)) return "";
  return plain(block.children);
}

function links(blocks: MdBlock[]): string[] {
  const found: string[] = [];
  const walk = (nodes: MdInline[]) => {
    for (const node of nodes) {
      if (node.kind === "link") {
        found.push(node.href);
        walk(node.children);
      } else if (node.kind === "strong" || node.kind === "em") {
        walk(node.children);
      }
    }
  };
  for (const block of blocks) {
    if ("items" in block) block.items.forEach(walk);
    else walk(block.children);
  }
  return found;
}

describe("parseMarkdown: struttura", () => {
  it("titoli, paragrafi e inline", () => {
    const blocks = parseMarkdown("## Titolo\n\nTesto **forte** e *corsivo*.\n\n### Sotto");
    expect(blocks).toEqual([
      { kind: "h2", children: [{ kind: "text", text: "Titolo" }] },
      {
        kind: "p",
        children: [
          { kind: "text", text: "Testo " },
          { kind: "strong", children: [{ kind: "text", text: "forte" }] },
          { kind: "text", text: " e " },
          { kind: "em", children: [{ kind: "text", text: "corsivo" }] },
          { kind: "text", text: "." },
        ],
      },
      { kind: "h3", children: [{ kind: "text", text: "Sotto" }] },
    ]);
  });

  it("le righe consecutive formano un solo paragrafo", () => {
    expect(parseMarkdown("prima\nseconda")).toEqual([{ kind: "p", children: [{ kind: "text", text: "prima seconda" }] }]);
  });

  it("elenchi puntati e numerati, ciascuno con i suoi elementi", () => {
    const blocks = parseMarkdown("- uno\n- due\n\n1. primo\n2. secondo");
    expect(blocks).toEqual([
      { kind: "ul", items: [[{ kind: "text", text: "uno" }], [{ kind: "text", text: "due" }]] },
      { kind: "ol", items: [[{ kind: "text", text: "primo" }], [{ kind: "text", text: "secondo" }]] },
    ]);
  });

  it("un elenco che cambia tipo senza riga vuota ne apre un altro", () => {
    expect(parseMarkdown("- a\n1. b").map((block) => block.kind)).toEqual(["ul", "ol"]);
  });

  it("i sorgenti con ritorni a capo di Windows si leggono allo stesso modo", () => {
    expect(parseMarkdown("## A\r\n\r\nB")).toEqual(parseMarkdown("## A\n\nB"));
  });

  it("il sorgente vuoto non produce blocchi", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });

  it("un asterisco isolato o senza chiusura resta testo", () => {
    expect(blockText(parseMarkdown("2 * 3 * 4")[0])).toBe("2 * 3 * 4");
    expect(blockText(parseMarkdown("solo **aperto")[0])).toBe("solo **aperto");
  });
});

describe("parseMarkdown: link", () => {
  it("ammette https e percorsi interni", () => {
    expect(links(parseMarkdown("[a](https://esempio.it/x) [b](/it/luoghi/palermo)"))).toEqual([
      "https://esempio.it/x",
      "/it/luoghi/palermo",
    ]);
  });

  it("non crea link verso schemi pericolosi, URL relativi al protocollo o http", () => {
    const hostile = [
      "[x](javascript:alert(1))",
      "[x](JavaScript:alert)",
      "[x](data:text/html,xss)",
      "[x](//evil.example/path)",
      "[x](/\\evil.example)",
      "[x](http://esempio.it)",
      "[x](vbscript:msgbox)",
    ];
    for (const source of hostile) {
      expect(links(parseMarkdown(source)), source).toEqual([]);
    }
  });

  it("i link non validi restano testo", () => {
    expect(blockText(parseMarkdown("[testo](javascript:x)")[0])).toBe("[testo](javascript:x)");
  });

  it("le immagini non sono supportate: restano testo, senza link", () => {
    const blocks = parseMarkdown("![foto](https://esempio.it/a.png)");
    expect(links(blocks)).toEqual([]);
    expect(blockText(blocks[0])).toBe("![foto](https://esempio.it/a.png)");
  });
});

describe("parseMarkdown: input malevoli", () => {
  it("l'HTML grezzo resta testo: l'albero contiene solo nodi di testo, strong, em o link", () => {
    const source = '<script>alert("x")</script> <img src=x onerror=alert(1)> <a href="javascript:x">y</a>';
    const blocks = parseMarkdown(source);
    const block = blocks[0];
    expect(block && block.kind === "p" ? block.children.every((node) => node.kind === "text") : false).toBe(true);
    expect(blockText(block)).toBe(source);
    expect(links(blocks)).toEqual([]);
  });

  it("marcatori non chiusi o annidati non fanno perdere testo né bloccano il parser", () => {
    expect(blockText(parseMarkdown("[a [b](/x)")[0])).toContain("a");
    expect(() => parseMarkdown("*".repeat(5000) + "[".repeat(5000))).not.toThrow();
  });
});

describe("isSafeHref", () => {
  it("accetta solo https assoluti e percorsi interni con una sola barra", () => {
    expect(isSafeHref("https://esempio.it")).toBe(true);
    expect(isSafeHref("/it/guide")).toBe(true);
    expect(isSafeHref("https:evil")).toBe(false);
    expect(isSafeHref("//esempio.it")).toBe(false);
    expect(isSafeHref("/a b")).toBe(false);
    expect(isSafeHref("/a\u0007")).toBe(false);
    expect(isSafeHref(`/${"a".repeat(2100)}`)).toBe(false);
  });
});
