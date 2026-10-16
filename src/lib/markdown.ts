// Markdown delle guide, con un parser proprio e senza dipendenze. Produce un albero di dati: il
// componente React lo rende come testo (React fa l'escape), quindi l'HTML grezzo non passa mai.
// Sintassi ammessa: titoli ## e ###, paragrafi, elenchi puntati (- o *) e numerati (1.),
// **grassetto**, *corsivo* e link [testo](url). I link vanno solo a https:// o a percorsi interni
// che iniziano con una sola barra; tutto il resto resta testo. Le immagini non sono supportate:
// la sintassi ![...](...) resta testo (le foto passano dal media, con crediti).

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em"; children: MdInline[] }
  | { kind: "link"; href: string; children: MdInline[] };

export type MdBlock =
  | { kind: "h2" | "h3" | "p"; children: MdInline[] }
  | { kind: "ul" | "ol"; items: MdInline[][] };

const MAX_HREF_LENGTH = 2048;
const BACKSLASH = String.fromCharCode(92);
const HEADING = /^(#{2,3})\s+(.+)$/;
const BULLET = /^[-*]\s+(.+)$/;
const NUMBERED = /^\d{1,3}\.\s+(.+)$/;
const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/y;
const IMAGE = /!\[[^\]\n]*\]\([^()\s]*\)/y;

// Link ammessi: https://… oppure percorso interno (/…, ma non //… né /\…).
export function isSafeHref(href: string): boolean {
  if (href.length > MAX_HREF_LENGTH) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(href)) return false;
  if (/^https:\/\//i.test(href)) {
    try {
      return new URL(href).protocol === "https:";
    } catch {
      return false;
    }
  }
  return new RegExp("^/(?!/)").test(href) && !href.includes(BACKSLASH);
}

function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer !== "") out.push({ kind: "text", text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) {
        flush();
        out.push({ kind: "strong", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if (text[i] === "*") {
      const close = text.indexOf("*", i + 1);
      const inner = close > i + 1 ? text.slice(i + 1, close) : "";
      if (inner !== "" && inner.trim() === inner) {
        flush();
        out.push({ kind: "em", children: parseInline(inner) });
        i = close + 1;
        continue;
      }
    }

    if (text[i] === "!") {
      IMAGE.lastIndex = i;
      const image = IMAGE.exec(text);
      if (image) {
        buffer += image[0];
        i = IMAGE.lastIndex;
        continue;
      }
    }

    if (text[i] === "[") {
      LINK.lastIndex = i;
      const link = LINK.exec(text);
      if (link && isSafeHref(link[2] ?? "")) {
        flush();
        // La ricorsione sul testo del link riusa LINK: la fine va letta prima.
        const end = LINK.lastIndex;
        out.push({ kind: "link", href: link[2] ?? "", children: parseInline(link[1] ?? "") });
        i = end;
        continue;
      }
    }

    buffer += text[i];
    i += 1;
  }
  flush();
  return out;
}

type Pending = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function emit(pending: Pending | null, blocks: MdBlock[]): void {
  if (!pending) return;
  if (pending.kind === "p") blocks.push({ kind: "p", children: parseInline(pending.lines.join(" ")) });
  else blocks.push({ kind: pending.kind, items: pending.items.map(parseInline) });
}

// Divide il sorgente in blocchi. Righe vuote chiudono il blocco corrente; le righe consecutive
// dello stesso tipo si uniscono (paragrafo) o formano un solo elenco.
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let pending: Pending | null = null;

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      emit(pending, blocks);
      pending = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      emit(pending, blocks);
      pending = null;
      blocks.push({ kind: heading[1]?.length === 2 ? "h2" : "h3", children: parseInline(heading[2] ?? "") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = bullet?.[1] ?? numbered?.[1] ?? "";
      if (pending && pending.kind !== "p" && pending.kind === kind) {
        pending.items.push(item);
      } else {
        emit(pending, blocks);
        pending = { kind, items: [item] };
      }
      continue;
    }

    if (pending && pending.kind === "p") {
      pending.lines.push(line);
    } else {
      emit(pending, blocks);
      pending = { kind: "p", lines: [line] };
    }
  }

  emit(pending, blocks);
  return blocks;
}
