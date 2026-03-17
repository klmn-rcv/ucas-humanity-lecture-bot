import { describe, expect, it } from "vitest";
import { isAllowedLectureTime, parseLectureStart } from "../src/time-window.js";

describe("time window rules", () => {
  it("allows monday at 17:00 or later", () => {
    const parsed = parseLectureStart("2026-03-16 17:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date)).toBe(true);
  });

  it("rejects monday before 17:00", () => {
    const parsed = parseLectureStart("2026-03-16 16:59");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date)).toBe(false);
  });

  it("allows tuesday at 19:00 or later", () => {
    const parsed = parseLectureStart("2026-03-17 19:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date)).toBe(true);
  });

  it("allows all wednesday lectures", () => {
    const parsed = parseLectureStart("2026-03-18 08:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date)).toBe(true);
  });

  it("rejects thursday lectures", () => {
    const parsed = parseLectureStart("2026-03-19 20:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date)).toBe(false);
  });
});
