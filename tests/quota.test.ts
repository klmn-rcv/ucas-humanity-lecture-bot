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

  it("parses record-page effective counts", () => {
    const quota = extractQuota("统计信息：累计听讲座 8 次，其中有效 6 次 说明：听讲有效记录15次及以上，即满足听讲要求。");
    expect(quota.bookedCount).toBe(6);
    expect(quota.requiredCount).toBe(15);
    expect(isQuotaReached(quota)).toBe(false);
  });
});
