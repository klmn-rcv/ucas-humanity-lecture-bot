import type { ScheduledRuntimeConfig } from "./types.js";

export function isWithinScheduledWindow(date: Date, schedule: ScheduledRuntimeConfig): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return schedule.periods.some(
    (period) => minutes >= period.startMinutes && minutes <= period.endMinutes
  );
}

export function getNextScheduledRun(after: Date, schedule: ScheduledRuntimeConfig): Date {
  const currentMinutes = after.getHours() * 60 + after.getMinutes();

  for (const period of schedule.periods) {
    if (currentMinutes < period.startMinutes) {
      return atMinutes(after, period.startMinutes);
    }

    if (currentMinutes > period.endMinutes) {
      continue;
    }

    const elapsed = currentMinutes - period.startMinutes;
    const nextOffset =
      (Math.floor(elapsed / schedule.intervalMinutes) + 1) * schedule.intervalMinutes;
    const candidateMinutes = period.startMinutes + nextOffset;
    if (candidateMinutes <= period.endMinutes) {
      return atMinutes(after, candidateMinutes);
    }
  }

  const nextDay = new Date(after);
  nextDay.setDate(nextDay.getDate() + 1);
  return atMinutes(nextDay, schedule.periods[0].startMinutes);
}

function atMinutes(base: Date, minutesSinceMidnight: number): Date {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutesSinceMidnight);
  return date;
}
