import type { ReservationQuota } from "./types.js";
import { normalizeWhitespace } from "./util.js";

const quotaPatterns: RegExp[] = [
  /已预约(?:次数)?[:：]?\s*(\d+)\s*[\/]\s*(\d+)/,
  /已预约(?:次数)?[:：]?\s*(\d+)\s*次.*?(?:要求|需完成|次数要求)[:：]?\s*(\d+)\s*次/,
  /(?:要求|需完成|次数要求)[:：]?\s*(\d+)\s*次.*?已预约(?:次数)?[:：]?\s*(\d+)\s*次/
];

export function extractQuota(text: string): ReservationQuota {
  const normalized = normalizeWhitespace(text);

  for (const pattern of quotaPatterns) {
    const matched = normalized.match(pattern);
    if (!matched) {
      continue;
    }

    if (pattern === quotaPatterns[2]) {
      return {
        bookedCount: Number(matched[2]),
        requiredCount: Number(matched[1]),
        rawText: matched[0]
      };
    }

    return {
      bookedCount: Number(matched[1]),
      requiredCount: Number(matched[2]),
      rawText: matched[0]
    };
  }

  return {
    bookedCount: null,
    requiredCount: null,
    rawText: null
  };
}

export function isQuotaReached(quota: ReservationQuota): boolean {
  if (quota.bookedCount === null || quota.requiredCount === null) {
    return false;
  }

  return quota.bookedCount >= quota.requiredCount;
}
