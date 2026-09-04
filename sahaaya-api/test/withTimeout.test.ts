import { describe, it, expect } from "vitest";
import { withTimeout } from "../src/lib/withTimeout";

describe("withTimeout", () => {
  it("returns the operation result when it resolves in time", async () => {
    const result = await withTimeout(
      () => Promise.resolve("ok"),
      100,
      () => "fallback"
    );
    expect(result).toBe("ok");
  });

  it("falls back with reason 'timeout' when the operation is too slow", async () => {
    const reasons: string[] = [];
    const result = await withTimeout(
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 200)),
      20,
      (reason) => {
        reasons.push(reason);
        return "fallback";
      }
    );
    expect(result).toBe("fallback");
    expect(reasons).toEqual(["timeout"]);
  });

  it("falls back with reason 'error' when the operation throws", async () => {
    const reasons: string[] = [];
    const result = await withTimeout(
      () => Promise.reject(new Error("boom")),
      100,
      (reason) => {
        reasons.push(reason);
        return "fallback";
      }
    );
    expect(result).toBe("fallback");
    expect(reasons).toEqual(["error"]);
  });
});
