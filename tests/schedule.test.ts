import { describe, expect, it } from "vitest";
import { getNextScheduledRun, isWithinScheduledWindow } from "../src/schedule.js";

const schedule = {
  startHour: 8,
  endHour: 18,
  intervalMinutes: 60,
  runImmediatelyOnStart: true
};

describe("schedule helpers", () => {
  it("treats active daytime hours as in-window", () => {
    expect(isWithinScheduledWindow(new Date("2026-03-18T08:30:00"), schedule)).toBe(true);
    expect(isWithinScheduledWindow(new Date("2026-03-18T18:45:00"), schedule)).toBe(true);
    expect(isWithinScheduledWindow(new Date("2026-03-18T07:59:00"), schedule)).toBe(false);
  });

  it("computes the next top-of-hour run in the same day", () => {
    const nextRun = getNextScheduledRun(new Date("2026-03-18T10:23:00"), schedule);
    expect(nextRun.toISOString()).toBe("2026-03-18T03:00:00.000Z");
  });

  it("rolls over to the next day after the last slot", () => {
    const nextRun = getNextScheduledRun(new Date("2026-03-18T18:30:00"), schedule);
    expect(nextRun.toISOString()).toBe("2026-03-19T00:00:00.000Z");
  });
});
