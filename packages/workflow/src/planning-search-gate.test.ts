import { describe, expect, it } from "vitest";
import { decideSearchGate, normalizeSearchKeyword } from "./planning-search-gate.js";

describe("normalizeSearchKeyword", () => {
  it("trims, collapses whitespace, lowercases so trivial variants collide", () => {
    expect(normalizeSearchKeyword("  孤独摇滚  ")).toBe("孤独摇滚");
    expect(normalizeSearchKeyword("Bocchi   The Rock")).toBe("bocchi the rock");
    expect(normalizeSearchKeyword("孤独摇滚")).toBe(normalizeSearchKeyword(" 孤独摇滚 "));
  });
});

describe("decideSearchGate", () => {
  it("fresh when keyword is new and under budget", () => {
    expect(
      decideSearchGate({ normalizedKeyword: "a", seenKeywords: new Set(), maxDistinctSearches: 8 }),
    ).toBe("fresh");
  });

  it("duplicate when keyword was already searched — no provider re-hit", () => {
    expect(
      decideSearchGate({
        normalizedKeyword: "a",
        seenKeywords: new Set(["a"]),
        maxDistinctSearches: 8,
      }),
    ).toBe("duplicate");
  });

  it("duplicate takes precedence over an exhausted budget", () => {
    // Re-searching an already-seen keyword is always free, even at the cap.
    expect(
      decideSearchGate({
        normalizedKeyword: "a",
        seenKeywords: new Set(["a", "b", "c"]),
        maxDistinctSearches: 3,
      }),
    ).toBe("duplicate");
  });

  it("exhausted when a NEW keyword would exceed the distinct-search budget", () => {
    expect(
      decideSearchGate({
        normalizedKeyword: "d",
        seenKeywords: new Set(["a", "b", "c"]),
        maxDistinctSearches: 3,
      }),
    ).toBe("exhausted");
  });

  it("allows exactly up to the budget of distinct searches", () => {
    expect(
      decideSearchGate({
        normalizedKeyword: "c",
        seenKeywords: new Set(["a", "b"]),
        maxDistinctSearches: 3,
      }),
    ).toBe("fresh");
  });
});
