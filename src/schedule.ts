import type { LectureRecord, ScheduledRuntimeConfig } from "./types.js";

// All unopened lectures participate; the earliest wake wins, including ties.
export function getNextReservationCheck(
  lectures: LectureRecord[], now: Date, nextScanAt: Date
): Date {
  let next = nextScanAt.getTime();
  for (const lecture of lectures) {
    if (lecture.terminalState || lecture.statusText === "预约已结束") continue;
    const closes = lecture.reservationClosesAt ? Date.parse(lecture.reservationClosesAt) : Infinity;
    const starts = lecture.startTimeIso ? Date.parse(lecture.startTimeIso) : Infinity;
    if (Math.min(closes, starts) <= now.getTime()) continue;
    const opens = lecture.reservationOpensAt ? Date.parse(lecture.reservationOpensAt) : null;
    if (opens !== null && opens > now.getTime()) {
      // Refresh/re-authenticate one minute before opening, then wait to the exact time.
      next = Math.min(next, opens - now.getTime() > 60000 ? opens - 60000 : opens);
    } else if (opens !== null || lecture.actionAvailable) {
      next = Math.min(next, now.getTime() + 1000);
    }
  }
  return new Date(Math.max(now.getTime(), next));
}

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
