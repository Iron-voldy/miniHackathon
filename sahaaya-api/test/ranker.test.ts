import { describe, it, expect } from "vitest";
import { fallbackRank } from "../src/services/ranker";

describe("fallbackRank", () => {
  it("puts recently used phrases first, then the rest in board order", () => {
    const allowed = ["A", "B", "C", "D"];
    const result = fallbackRank(allowed, ["C", "A"]);
    expect(result).toEqual(["C", "A", "B", "D"]);
  });

  it("ignores recent ids that are not on the allow-list", () => {
    const allowed = ["A", "B"];
    const result = fallbackRank(allowed, ["Z", "A"]);
    expect(result).toEqual(["A", "B"]);
  });

  it("returns the board order unchanged when there is no recent history", () => {
    const allowed = ["A", "B", "C"];
    expect(fallbackRank(allowed)).toEqual(["A", "B", "C"]);
  });
});
