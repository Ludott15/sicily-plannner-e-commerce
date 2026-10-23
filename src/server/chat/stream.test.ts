import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { classifyChatError, TurnFailure } from "./stream";

describe("classifyChatError", () => {
  it("mappa gli errori del turno e quelli del client sui codici dell'evento", () => {
    expect(classifyChatError(new TurnFailure("overloaded"))).toBe("overloaded");
    expect(classifyChatError(new Error("boom"))).toBe("api_error");
    expect(classifyChatError(new Anthropic.APIConnectionTimeoutError({ message: "timeout" }))).toBe("timeout");
  });
});
