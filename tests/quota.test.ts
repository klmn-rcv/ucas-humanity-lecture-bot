import { describe, expect, it } from "vitest";
import { extractQuota, isQuotaReached } from "../src/quota.js";

describe("reservation quota parser", () => {
  it("parses slash-separated counts", () => {
    const quota = extractQuota("当前已预约次数：3/5");
    expect(quota.bookedCount).toBe(3);
    expect(quota.requiredCount).toBe(5);
    expect(isQuotaReached(quota)).toBe(false);
  });

  it("parses descriptive counts", () => {
    const quota = extractQuota("已预约 5 次，本学期次数要求：5 次");
    expect(quota.bookedCount).toBe(5);
    expect(quota.requiredCount).toBe(5);
    expect(isQuotaReached(quota)).toBe(true);
  });
});
