import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("../src/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_TIMEOUT_MS: 500,
  },
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

import { rankPhrases } from "../src/services/llmRanker";

const ALLOWED_PHRASES = [
  { id: "A", english: "Water" },
  { id: "B", english: "Food" },
  { id: "C", english: "Sleep" },
];

beforeEach(() => {
  createMock.mockReset();
});

describe("rankPhrases", () => {
  it("returns llm ranking when the model responds with valid ids only", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ rankedPhraseIds: ["B", "A", "C"] }) } }],
    });

    const result = await rankPhrases(ALLOWED_PHRASES, []);

    expect(result.reasonCode).toBe("llm");
    expect(result.rankedPhraseIds).toEqual(["B", "A", "C"]);
  });

  it("drops any id the model returns that is not on the allow-list", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(["Z", "A", "INJECTED", "B"]) } }],
    });

    const result = await rankPhrases(ALLOWED_PHRASES, []);

    expect(result.reasonCode).toBe("llm");
    expect(result.rankedPhraseIds).not.toContain("Z");
    expect(result.rankedPhraseIds).not.toContain("INJECTED");
    // Omitted allowed id ("C") is appended in board order.
    expect(result.rankedPhraseIds).toEqual(["A", "B", "C"]);
  });

  it("falls back to deterministic ranking when the model call throws", async () => {
    createMock.mockRejectedValue(new Error("api_error"));

    const result = await rankPhrases(ALLOWED_PHRASES, ["C"]);

    expect(result.reasonCode).toBe("fallback_error");
    expect(result.rankedPhraseIds).toEqual(["C", "A", "B"]);
  });

  it("falls back to deterministic ranking when the model call times out", async () => {
    createMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    const result = await rankPhrases(ALLOWED_PHRASES, []);

    expect(result.reasonCode).toBe("fallback_timeout");
    expect(result.rankedPhraseIds).toEqual(["A", "B", "C"]);
  }, 10000);
});
