import { describe, expect, it } from "vitest";
import { getNextScheduledRun, isWithinScheduledWindow } from "../src/schedule.js";

const schedule = {
  periods: [
    { startMinutes: 8 * 60, endMinutes: 12 * 60 },
    { startMinutes: 14 * 60, endMinutes: 18 * 60 }
  ],
  intervalMinutes: 60,
  runImmediatelyOnStart: true
};

describe("schedule helpers", () => {
  it("treats configured daytime periods as in-window", () => {
    expect(isWithinScheduledWindow(new Date("2026-03-18T08:30:00"), schedule)).toBe(true);
    expect(isWithinScheduledWindow(new Date("2026-03-18T13:00:00"), schedule)).toBe(false);
    expect(isWithinScheduledWindow(new Date("2026-03-18T18:00:00"), schedule)).toBe(true);
  });

  it("computes the next top-of-hour run in the same period", () => {
    const nextRun = getNextScheduledRun(new Date("2026-03-18T10:23:00"), schedule);
    expect(nextRun.toISOString()).toBe("2026-03-18T03:00:00.000Z");
  });

  it("jumps to the next configured period on the same day", () => {
    const nextRun = getNextScheduledRun(new Date("2026-03-18T12:30:00"), schedule);
    expect(nextRun.toISOString()).toBe("2026-03-18T06:00:00.000Z");
  });

  it("rolls over to the next day after the last slot", () => {
    const nextRun = getNextScheduledRun(new Date("2026-03-18T18:30:00"), schedule);
    expect(nextRun.toISOString()).toBe("2026-03-19T00:00:00.000Z");
  });
});
