import { describe, expect, it, vi } from "vitest";
import { ogColors } from "@generated/design/og";
import { emailUrl, escapeHtml, renderEmailLayout } from "./layout";

// Traduzione finta: restituisce la chiave e i valori, così il test non legge i file dei messaggi.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const url = "https://example.test/it/azione/abc";

describe("escapeHtml", () => {
  it("escapa i caratteri pericolosi", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});

describe("emailUrl", () => {
  it("accetta https e http solo verso localhost", () => {
    expect(emailUrl(url)).toBe(url);
    expect(emailUrl("http://localhost:3000/it")).toBe("http://localhost:3000/it");
  });

  it("rifiuta http verso altri host e gli schemi non web", () => {
    expect(() => emailUrl("http://example.test/x")).toThrow("email_url_not_https");
    expect(() => emailUrl("javascript:alert(1)")).toThrow("email_url_not_https");
  });
});

describe("renderEmailLayout", () => {
  it("scrive ogni valore escapato: un testo con <script> esce come testo", async () => {
    const email = await renderEmailLayout({
      locale: "it",
      preheader: "<script>x</script>",
      heading: "<script>alert(1)</script>",
      paragraphs: ["<img src=x onerror=1>"],
      footerNote: "<b>nota</b>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&lt;img src=x onerror=1&gt;");
  });

  it("include nel testo semplice titolo, paragrafi, CTA e nota", async () => {
    const email = await renderEmailLayout({
      locale: "it",
      preheader: "anteprima",
      heading: "Titolo",
      paragraphs: ["Primo paragrafo", "Secondo paragrafo"],
      cta: { label: "Apri", url },
      footerNote: "Nota finale",
    });
    expect(email.text).toContain("Titolo");
    expect(email.text).toContain("Primo paragrafo");
    expect(email.text).toContain("Secondo paragrafo");
    expect(email.text).toContain(`Apri: ${url}`);
    expect(email.text).toContain("Nota finale");
    expect(email.text).not.toContain("anteprima");
  });

  it("mette la CTA con URL https nel pulsante e nel link di ripiego", async () => {
    const email = await renderEmailLayout({
      locale: "en",
      preheader: "p",
      heading: "h",
      paragraphs: [],
      cta: { label: "Apri", url },
      footerNote: "n",
    });
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html.match(/href="https:\/\//g)?.length).toBe(2);
  });

  it("senza CTA non scrive link", async () => {
    const email = await renderEmailLayout({
      locale: "it",
      preheader: "p",
      heading: "h",
      paragraphs: ["solo testo"],
      footerNote: "n",
    });
    expect(email.html).not.toContain("<a ");
    expect(email.html).not.toContain("href=");
  });

  it("usa i colori dei token e la larghezza 600, senza valori scritti a mano", async () => {
    const email = await renderEmailLayout({
      locale: "it",
      preheader: "p",
      heading: "h",
      paragraphs: ["p"],
      footerNote: "n",
    });
    expect(email.html).toContain(ogColors.calce);
    expect(email.html).toContain('width="600"');
    expect(email.html).not.toMatch(/rgb\(|oklch\(/i);
  });

  it("non scrive undefined o null quando non ci sono CTA e paragrafi", async () => {
    const email = await renderEmailLayout({
      locale: "it",
      preheader: "p",
      heading: "h",
      paragraphs: [],
      footerNote: "n",
    });
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
    expect(email.html).not.toContain("null");
  });
});
