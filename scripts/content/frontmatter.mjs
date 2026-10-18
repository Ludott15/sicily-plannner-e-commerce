// Frontmatter dei file Markdown di content/ (guide e testi legali): un sottoinsieme di YAML,
// senza dipendenze. Supporta solo:
//   chiave: valore            (valore semplice, opzionalmente tra virgolette)
//   chiave:                   seguita da righe indentate "- valore" (lista di testi)
//   chiave:                   seguita da righe "- chiave: valore" con altre chiavi indentate (lista di oggetti)
// Tutto il resto (ancore, blocchi multilinea, commenti) è un errore esplicito, mai un'interpretazione silenziosa.

const KEY_LINE = /^([a-z_]+):(?:\s+(.*))?$/;
const ITEM_LINE = /^\s*-\s+(.*)$/;
const NESTED_KEY_LINE = /^\s+([a-z_]+):(?:\s+(.*))?$/;

function unquote(raw) {
  const value = raw.trim();
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) {
    return quote === '"' ? value.slice(1, -1).replace(/\\"/g, '"') : value.slice(1, -1);
  }
  return value;
}

function parseListItems(lines, key) {
  const items = [];
  let current = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const item = ITEM_LINE.exec(line);
    if (item) {
      const body = item[1];
      const pair = KEY_LINE.exec(body);
      if (pair) {
        current = { [pair[1]]: unquote(pair[2] ?? "") };
        items.push(current);
      } else {
        current = null;
        items.push(unquote(body));
      }
      continue;
    }
    const nested = NESTED_KEY_LINE.exec(line);
    if (nested && current !== null) {
      if (nested[1] in current) throw new Error(`frontmatter: chiave "${nested[1]}" ripetuta in "${key}"`);
      current[nested[1]] = unquote(nested[2] ?? "");
      continue;
    }
    throw new Error(`frontmatter: riga non riconosciuta sotto "${key}": "${line}"`);
  }
  const allText = items.every((item) => typeof item === "string");
  const allObjects = items.every((item) => typeof item === "object");
  if (!allText && !allObjects) throw new Error(`frontmatter: "${key}" mescola testi e oggetti`);
  return items;
}

// Legge l'intestazione (le righe tra i due "---"). Restituisce un oggetto con valori stringa,
// liste di stringhe o liste di oggetti.
export function parseFrontmatterHeader(lines) {
  const data = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const pair = KEY_LINE.exec(line);
    if (!pair) throw new Error(`frontmatter: riga non riconosciuta: "${line}"`);
    const [, key, raw] = pair;
    if (key in data) throw new Error(`frontmatter: chiave "${key}" ripetuta`);
    index += 1;
    if (raw !== undefined && raw.trim() !== "") {
      data[key] = unquote(raw);
      continue;
    }
    const block = [];
    while (index < lines.length && (lines[index].trim() === "" || /^\s/.test(lines[index]))) {
      block.push(lines[index]);
      index += 1;
    }
    data[key] = parseListItems(block, key);
  }
  return data;
}

// Separa l'intestazione dal corpo. Senza "---" in prima riga, il corpo è tutto il testo.
export function splitFrontmatter(source) {
  const text = source.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") return { data: {}, body: text };
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("frontmatter: intestazione non chiusa con ---");
  const data = parseFrontmatterHeader(lines.slice(1, end));
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  return { data, body };
}
