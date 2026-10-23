import { describe, expect, it, vi } from "vitest";
import { renderTripReminderEmail } from "./trip-reminder";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const url = "https://example.test/it/viaggi/42";
const base = {
  locale: "it",
  tripName: "Costa <Sud>",
  startDate: "sabato 3 ottobre",
  stops: ["Noto", "Modica"],
  url,
};

describe("renderTripReminderEmail", () => {
  it("oggetto con nome del viaggio e data di partenza", async () => {
    const email = await renderTripReminderEmail(base);
    expect(email.subject).toContain("Email.tripReminder.subject");
    expect(email.subject).toContain("sabato 3 ottobre");
  });

  it("numera le tappe nel testo semplice e nell'HTML", async () => {
    const email = await renderTripReminderEmail(base);
    expect(email.text).toContain("Email.tripReminder.stopsLabel");
    expect(email.text).toContain('Email.tripReminder.stop {"index":"1","name":"Noto"}');
    expect(email.html).toContain('{&quot;index&quot;:&quot;2&quot;,&quot;name&quot;:&quot;Modica&quot;}');
  });

  it("senza tappe non scrive la sezione, e la CTA è https", async () => {
    const email = await renderTripReminderEmail({ ...base, stops: [] });
    expect(email.text).not.toContain("Email.tripReminder.stopsLabel");
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("Costa &lt;Sud&gt;");
    expect(email.html).not.toContain("undefined");
  });
});
