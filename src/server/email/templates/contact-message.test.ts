import { describe, expect, it, vi } from "vitest";
import { messageParagraphs, renderContactMessageEmail } from "./contact-message";

// Traduzione finta: restituisce la chiave e i valori, così il test non legge i file dei messaggi.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const base = {
  topic: "privacy" as const,
  name: "Anna",
  email: "anna@example.com",
  message: "Primo punto.\nSecondo punto.",
};

describe("messageParagraphs", () => {
  it("divide il messaggio in righe non vuote", () => {
    expect(messageParagraphs("  uno \r\n\r\n due  \n")).toEqual(["uno", "due"]);
  });
});

describe("renderContactMessageEmail", () => {
  it("usa oggetto e testi del namespace Email.contactMessage con argomento e mittente", async () => {
    const email = await renderContactMessageEmail(base);
    expect(email.subject).toContain("Email.contactMessage.subject");
    expect(email.subject).toContain("Email.contactMessage.topics.privacy");
    expect(email.text).toContain('Email.contactMessage.from {"name":"Anna","email":"anna@example.com"}');
    expect(email.text).toContain("Primo punto.");
    expect(email.text).toContain("Secondo punto.");
  });

  it("usa il segnaposto del nome quando manca, senza scrivere null o undefined", async () => {
    const email = await renderContactMessageEmail({ ...base, name: null });
    expect(email.html).toContain("Email.contactMessage.unnamed");
    expect(email.html).not.toContain("null");
    expect(email.text).not.toContain("undefined");
  });

  it("escapa il messaggio e il nome, anche con <script>", async () => {
    const email = await renderContactMessageEmail({
      ...base,
      name: "<script>x</script>",
      message: "<script>alert(1)</script>\nvia & ritorno",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("via &amp; ritorno");
  });
});
