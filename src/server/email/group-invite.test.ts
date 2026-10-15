import { describe, expect, it, vi } from "vitest";
import { ogColors } from "@generated/design/og";
import { escapeHtml, renderGroupInviteEmail } from "./group-invite";

// Traduzione finta: restituisce la chiave e i valori, così il test non legge i file dei messaggi.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const url = "https://example.test/it/invito/abc";

describe("escapeHtml", () => {
  it("escapa i caratteri pericolosi", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});

describe("renderGroupInviteEmail", () => {
  it("usa oggetto e testi del namespace GroupInviteEmail con nome del gruppo e di chi invita", async () => {
    const email = await renderGroupInviteEmail({ groupName: "Ragusa <3", inviterName: "Anna", url, locale: "it" });
    expect(email.subject).toContain("GroupInviteEmail.subject");
    expect(email.subject).toContain("Anna");
    expect(email.html).toContain("Ragusa &lt;3");
    expect(email.text).toContain("Ragusa <3");
  });

  it("usa il link dell'invito nel pulsante e nel testo semplice", async () => {
    const email = await renderGroupInviteEmail({ groupName: "G", inviterName: null, url, locale: "en" });
    expect(email.html).toContain(`href="${url}"`);
    expect(email.text).toContain(url);
  });

  it("non scrive colori esadecimali a mano: solo i token del design", async () => {
    const email = await renderGroupInviteEmail({ groupName: "G", inviterName: "A", url, locale: "it" });
    expect(email.html).toContain(ogColors.calce);
    expect(email.html).not.toMatch(/#[0-9a-f]{3}\b(?![0-9a-f])/i);
  });
});
