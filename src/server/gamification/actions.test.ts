import { beforeEach, describe, expect, it, vi } from "vitest";

// Prova a rovescio del limite sulle recensioni (passo 11.5, revisione B1): con il contatore a limite la
// recensione non arriva al database. Il limite è per utente, e qui fallisce aperto (come la ricerca):
// un contatore non disponibile non blocca la recensione.

const checkRate = vi.fn();
const submitReview = vi.fn();
const reportReview = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/server/privacy/consents", () => ({ setConsent: vi.fn() }));
vi.mock("@/server/security/rate-limit", () => ({
  REVIEW_RULES: {
    submit: { scope: "review:submit:user", limit: 20, windowSeconds: 86400 },
    report: { scope: "review:report:user", limit: 30, windowSeconds: 86400 },
  },
  checkRate: (...args: unknown[]) => checkRate(...args),
}));
vi.mock("./core", () => ({
  recordCheckIn: vi.fn(),
  reportReview: (...args: unknown[]) => reportReview(...args),
  submitReview: (...args: unknown[]) => submitReview(...args),
}));

import { reportReviewAction, submitReviewAction } from "./actions";

const IDLE = { status: "idle" as const };
const review = { activityId: "00000000-0000-4000-8000-000000000001", rating: 5, text: "Bellissimo", locale: "it" };

beforeEach(() => {
  vi.clearAllMocks();
  submitReview.mockResolvedValue({ status: "saved", rewarded: false });
  reportReview.mockResolvedValue({ status: "reported" });
});

describe("submitReviewAction", () => {
  it("contatore a limite: rate_limited e nessuna recensione scritta", async () => {
    checkRate.mockResolvedValue("limited");
    await expect(submitReviewAction(IDLE, review)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(submitReview).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail open, la recensione si salva", async () => {
    checkRate.mockResolvedValue("unavailable");
    await expect(submitReviewAction(IDLE, review)).resolves.toEqual({ status: "saved", rewarded: false });
    expect(submitReview).toHaveBeenCalledTimes(1);
  });
});

describe("reportReviewAction", () => {
  it("contatore a limite: rate_limited e nessuna segnalazione", async () => {
    checkRate.mockResolvedValue("limited");
    await expect(
      reportReviewAction({ status: "idle" }, { reviewId: "00000000-0000-4000-8000-000000000002", reason: "spam" }),
    ).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(reportReview).not.toHaveBeenCalled();
  });
});
