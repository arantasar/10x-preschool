import { describe, expect, it } from "vitest";
import { normalizePendingTopic, PENDING_TOPIC_MAX } from "@/lib/pending-topic";

describe("normalizePendingTopic", () => {
  it.each([null, undefined, "", "   ", "\n\t "])("drops a missing or blank value (%j)", (raw) => {
    expect(normalizePendingTopic(raw)).toBeNull();
  });

  it("trims and collapses inner whitespace", () => {
    expect(normalizePendingTopic("  Dzień   Pluszowego\n Misia \t")).toBe("Dzień Pluszowego Misia");
  });

  it("keeps a value of exactly the limit and drops one character more", () => {
    expect(PENDING_TOPIC_MAX).toBe(200);
    const atLimit = "a".repeat(PENDING_TOPIC_MAX);
    expect(normalizePendingTopic(atLimit)).toBe(atLimit);
    expect(normalizePendingTopic(`${atLimit}a`)).toBeNull();
  });

  it("measures the limit after trimming", () => {
    const atLimit = "a".repeat(PENDING_TOPIC_MAX);
    expect(normalizePendingTopic(`   ${atLimit}   `)).toBe(atLimit);
  });

  it("keeps Polish letters and punctuation as typed", () => {
    expect(normalizePendingTopic("Żółć, gęś i „źdźbło”/łąka")).toBe("Żółć, gęś i „źdźbło”/łąka");
  });
});
