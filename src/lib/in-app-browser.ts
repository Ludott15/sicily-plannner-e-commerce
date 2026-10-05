// Browser interni delle app social (docs/design/brand/schemi.md, "Arrivi dai social"): lì Google
// blocca l'accesso OAuth, quindi il pulsante Google si nasconde e si invita ad aprire il sito
// nel browser. Il riconoscimento usa lo user agent, che queste app modificano in modo stabile.

export type InAppBrowser = "instagram" | "facebook" | "tiktok";

const PATTERNS: [InAppBrowser, RegExp][] = [
  // Instagram prima di Facebook: il browser di Instagram può contenere anche FBAN/FBAV.
  ["instagram", /\bInstagram\b/i],
  ["facebook", /\bFB(AN|AV|IOS|_IAB|4A)\b|\bFBAN\/|\bFBAV\/|\bMessengerForiOS\b/i],
  ["tiktok", /\bmusical_ly\b|\bBytedanceWebview\b|\bTikTok\b|\btrill_\d/i],
];

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  if (!userAgent) return null;
  for (const [app, pattern] of PATTERNS) {
    if (pattern.test(userAgent)) return app;
  }
  return null;
}
