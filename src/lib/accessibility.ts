// Verifica automatica dell'accessibilità, citata nella dichiarazione (passo 11.4). La data va
// aggiornata quando e2e/a11y.spec.ts passa di nuovo su tutte le pagine elencate.
export const ACCESSIBILITY_CHECK = {
  tool: "axe-core",
  standard: "WCAG 2.2 AA",
  lastAutomatedCheck: "2026-10-16",
} as const;
