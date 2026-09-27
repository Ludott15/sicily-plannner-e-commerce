const BASE = "http://internal.invalid";

// Accetta solo percorsi interni: niente open redirect verso domini esterni.
// Il parsing con URL copre anche i casi che i browser normalizzano (/\evil.com, tab, ecc.).
export function safeNextPath(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/")) return fallback;

  const url = new URL(next, BASE);
  if (url.origin !== BASE) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
