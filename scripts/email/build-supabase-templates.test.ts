import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSupabaseTemplates } from "./build-supabase-templates.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const built = buildSupabaseTemplates(root);

// Variabili Go template presenti in un file, senza ripetizioni.
function goVariables(html: string): string[] {
  return [...new Set([...html.matchAll(/\{\{ \.(\w+) \}\}/g)].map((m) => m[1] ?? ""))].sort();
}

describe("template email di Supabase", () => {
  it.each(Object.keys(built))("%s è aggiornato rispetto a messaggi, token e nome del brand", (file) => {
    expect(readFileSync(join(root, file), "utf8")).toBe(built[file]);
  });

  it("mantiene le variabili Go template che Supabase sostituisce", () => {
    expect(goVariables(built["supabase/templates/code.html"] ?? "")).toEqual(["ConfirmationURL", "Token"]);
    expect(goVariables(built["supabase/templates/email-change.html"] ?? "")).toEqual(["Token"]);
  });

  it("il pulsante di accesso punta alla variabile ConfirmationURL, non a un valore scritto a mano", () => {
    expect(built["supabase/templates/code.html"]).toContain('href="{{ .ConfirmationURL }}"');
  });
});
