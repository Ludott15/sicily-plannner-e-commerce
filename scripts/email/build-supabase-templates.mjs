// Genera i template email di Supabase Auth (supabase/templates/code.html, email-change.html)
// con lo stesso aspetto del layout di src/server/email/layout.ts. Testi da messages/it.json e
// messages/en.json (namespace Email.supabase), colori da docs/design/tokens.json (tema chiaro),
// nome da src/lib/brand.ts.
//
//   node scripts/email/build-supabase-templates.mjs          scrive i file
//   node scripts/email/build-supabase-templates.mjs --check  esce con 1 se i file non sono aggiornati
//
// Le variabili Go template di Supabase ({{ .Token }}, {{ .ConfirmationURL }}) restano letterali.
// Dopo ogni modifica: npm run email:templates, poi copiare i file nella dashboard di Supabase
// (Authentication > Email Templates), come indicato in docs/LANCIO.md.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const TOKEN = "{{ .Token }}";
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

// Colori usati dal layout, risolti dal tema chiaro dei token.
const COLOR_NAMES = ["calce", "calce-raised", "divider", "lava", "lava-muted", "coccio", "on-coccio", "coccio-text"];

// Un file per tipo di email; ogni file ha una sezione in italiano e una in inglese.
const TEMPLATES = [
  { file: "supabase/templates/code.html", key: "code", token: true, cta: true },
  { file: "supabase/templates/email-change.html", key: "emailChange", token: true, cta: false },
];

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function readJson(root, file) {
  return JSON.parse(readFileSync(join(root, file), "utf8"));
}

function readBrand(root) {
  const source = readFileSync(join(root, "src/lib/brand.ts"), "utf8");
  const match = /export const BRAND_NAME = "([^"]+)";/.exec(source);
  if (!match) throw new Error("BRAND_NAME non trovato in src/lib/brand.ts");
  return match[1];
}

function lightColor(tokens, name) {
  const token = tokens.color.tokens.find((entry) => entry.name === name);
  if (!token) throw new Error(`token colore mancante: ${name}`);
  const raw = typeof token.value === "string" ? token.value : token.value.light;
  const alias = /^\{([a-z0-9-]+)\}$/.exec(raw);
  return alias ? lightColor(tokens, alias[1]) : raw;
}

// Prima famiglia di una pila di font dei token: "\"Fraunces\", Georgia, serif" -> Fraunces.
function firstFamily(stack) {
  return stack.split(",")[0].trim().replace(/^"|"$/g, "");
}

function renderSection(lang, texts, tpl, ctx) {
  const text = (key) => escapeHtml(texts[key]).replaceAll("{brand}", ctx.brandHtml);
  const parts = [paragraph(text("lead"), ctx, ctx.colors.lava)];
  if (tpl.token) {
    parts.push(
      `<p style="margin:0 0 16px;font-family:${ctx.fontDisplay};font-size:28px;font-weight:600;letter-spacing:4px;line-height:1.2;color:${ctx.colors.lava};">${TOKEN}</p>`,
    );
  }
  parts.push(paragraph(text("hint"), ctx, ctx.colors.lava));
  if (tpl.cta) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr><td style="border-radius:999px;background:${ctx.colors.coccio};"><a href="${CONFIRMATION_URL}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:${ctx.fontSans};font-size:16px;font-weight:600;line-height:1.2;color:${ctx.colors["on-coccio"]};text-decoration:none;">${text("cta")}</a></td></tr></table>`,
    );
    parts.push(paragraph(text("linkHint"), ctx, ctx.colors["lava-muted"], 13));
  }
  parts.push(paragraph(text("ignore"), ctx, ctx.colors["lava-muted"], 13));
  return `<div lang="${lang}">\n${parts.join("\n")}\n</div>`;
}

function paragraph(html, ctx, color, size = 16) {
  return `<p style="margin:0 0 16px;font-family:${ctx.fontSans};font-size:${size}px;line-height:1.5;color:${color};">${html}</p>`;
}

function renderTemplate(tpl, ctx) {
  const it = renderSection("it", ctx.messages.it.Email.supabase[tpl.key], tpl, ctx);
  const en = renderSection("en", ctx.messages.en.Email.supabase[tpl.key], tpl, ctx);
  const preheader = escapeHtml(ctx.messages.it.Email.supabase[tpl.key].lead).replaceAll("{brand}", ctx.brandHtml);
  const tagline = escapeHtml(ctx.messages.it.Email.layout.tagline);
  const { colors } = ctx;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${ctx.brandHtml}</title>
</head>
<body style="margin:0;padding:0;background:${colors.calce};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.calce};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 8px 24px;font-family:${ctx.fontDisplay};font-size:28px;font-weight:600;line-height:1;color:${colors.lava};">${ctx.brandHtml}</td></tr>
<tr><td style="background:${colors["calce-raised"]};border:1px solid ${colors.divider};border-radius:16px;padding:32px;">
${it}
<hr style="border:0;border-top:1px solid ${colors.divider};margin:24px 0;">
${en}
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${ctx.fontSans};font-size:13px;line-height:1.5;color:${colors["lava-muted"]};">${ctx.brandHtml}: ${tagline}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

// Restituisce il contenuto di ogni file, indicizzato per percorso relativo alla radice del repo.
export function buildSupabaseTemplates(root = ROOT) {
  const tokens = readJson(root, "docs/design/tokens.json");
  const messages = { it: readJson(root, "messages/it.json"), en: readJson(root, "messages/en.json") };
  const brand = readBrand(root);
  const colors = Object.fromEntries(COLOR_NAMES.map((name) => [name, lightColor(tokens, name)]));
  const ctx = {
    messages,
    colors,
    brandHtml: escapeHtml(brand),
    fontDisplay: `'${firstFamily(tokens.type.families.display)}', ui-serif, serif`,
    fontSans: `'${firstFamily(tokens.type.families.sans)}', system-ui, sans-serif`,
  };
  return Object.fromEntries(TEMPLATES.map((tpl) => [tpl.file, renderTemplate(tpl, ctx)]));
}

function main() {
  const check = process.argv.includes("--check");
  const outputs = buildSupabaseTemplates(ROOT);
  const stale = [];
  for (const [file, html] of Object.entries(outputs)) {
    const path = join(ROOT, file);
    if (check) {
      if (readFileSync(path, "utf8") !== html) stale.push(file);
    } else {
      writeFileSync(path, html);
    }
  }
  if (stale.length) {
    console.error(`Template email non aggiornati: ${stale.join(", ")}. Esegui npm run email:templates.`);
    process.exit(1);
  }
  console.log(check ? "Template email aggiornati." : `Scritti ${Object.keys(outputs).length} template in supabase/templates.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
