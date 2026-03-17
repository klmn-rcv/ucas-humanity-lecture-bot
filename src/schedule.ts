import type { ScheduledRuntimeConfig } from "./types.js";

export function isWithinScheduledWindow(
  date: Date,
  schedule: ScheduledRuntimeConfig
): boolean {
  const hour = date.getHours();
  return hour >= schedule.startHour && hour <= schedule.endHour;
}

export function getNextScheduledRun(
  after: Date,
  schedule: ScheduledRuntimeConfig
): Date {
  const currentMinutes = after.getHours() * 60 + after.getMinutes();
  const startMinutes = schedule.startHour * 60;
  const endMinutes = schedule.endHour * 60;

  for (
    let candidateMinutes = startMinutes;
    candidateMinutes <= endMinutes;
    candidateMinutes += schedule.intervalMinutes
  ) {
    if (candidateMinutes <= currentMinutes) {
      continue;
    }

    return atMinutes(after, candidateMinutes);
  }

  const nextDay = new Date(after);
  nextDay.setDate(nextDay.getDate() + 1);
  return atMinutes(nextDay, startMinutes);
}

function atMinutes(base: Date, minutesSinceMidnight: number): Date {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutesSinceMidnight);
  return date;
}
