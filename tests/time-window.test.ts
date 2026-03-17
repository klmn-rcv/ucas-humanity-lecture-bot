import { describe, expect, it } from "vitest";
import { isAllowedLectureTime, parseLectureStart } from "../src/time-window.js";

const defaultRules = [
  { weekday: 1, ranges: [{ startMinutes: 17 * 60, endMinutes: 23 * 60 + 59 }] },
  { weekday: 2, ranges: [{ startMinutes: 19 * 60, endMinutes: 23 * 60 + 59 }] },
  { weekday: 3, ranges: [{ startMinutes: 0, endMinutes: 23 * 60 + 59 }] }
];

describe("time window rules", () => {
  it("allows monday at 17:00 or later", () => {
    const parsed = parseLectureStart("2026-03-16 17:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date, defaultRules)).toBe(true);
  });

  it("rejects monday before 17:00", () => {
    const parsed = parseLectureStart("2026-03-16 16:59");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date, defaultRules)).toBe(false);
  });

  it("allows tuesday at 19:00 or later", () => {
    const parsed = parseLectureStart("2026-03-17 19:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date, defaultRules)).toBe(true);
  });

  it("allows all wednesday lectures", () => {
    const parsed = parseLectureStart("2026-03-18 08:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date, defaultRules)).toBe(true);
  });

  it("rejects thursday lectures", () => {
    const parsed = parseLectureStart("2026-03-19 20:00");
    expect(parsed).not.toBeNull();
    expect(isAllowedLectureTime(parsed!.date, defaultRules)).toBe(false);
  });

  it("supports multiple discontinuous periods in one day", () => {
    const morning = parseLectureStart("2026-03-19 10:30");
    const noon = parseLectureStart("2026-03-19 12:30");
    const evening = parseLectureStart("2026-03-19 15:30");
    expect(morning).not.toBeNull();
    expect(noon).not.toBeNull();
    expect(evening).not.toBeNull();

    const rules = [
      {
        weekday: 4,
        ranges: [
          { startMinutes: 9 * 60, endMinutes: 11 * 60 },
          { startMinutes: 15 * 60, endMinutes: 17 * 60 }
        ]
      }
    ];

    expect(isAllowedLectureTime(morning!.date, rules)).toBe(true);
    expect(isAllowedLectureTime(noon!.date, rules)).toBe(false);
    expect(isAllowedLectureTime(evening!.date, rules)).toBe(true);
  });
});
