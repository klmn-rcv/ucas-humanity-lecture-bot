import type { DailyTimeWindows, TimeRange } from "./types.js";
import { normalizeWhitespace } from "./util.js";

export interface ParsedLectureTime {
  date: Date;
  iso: string;
}

const timePattern =
  /(?:(?<year>\d{4})[年/-])?(?<month>\d{1,2})[月/-](?<day>\d{1,2})(?:日)?(?:\s*[（(]?(?:周|星期)?(?<weekday>[一二三四五六日天])[)）]?)?\s+(?<hour>\d{1,2}):(?<minute>\d{2})/;

export function parseLectureStart(text: string, now = new Date()): ParsedLectureTime | null {
  const normalized = normalizeWhitespace(text);
  const matched = normalized.match(timePattern);
  if (!matched?.groups) {
    return null;
  }

  const year = matched.groups.year ? Number(matched.groups.year) : now.getFullYear();
  const month = Number(matched.groups.month);
  const day = Number(matched.groups.day);
  const hour = Number(matched.groups.hour);
  const minute = Number(matched.groups.minute);

  if ([month, day, hour, minute].some(Number.isNaN)) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    date,
    iso: date.toISOString()
  };
}

export function isAllowedLectureTime(date: Date, rules: DailyTimeWindows[]): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (
    rules.find((rule) => rule.weekday === date.getDay())?.ranges.some((range) =>
      matchesTimeRange(minutes, range)
    ) ?? false
  );
}

export function explainTimeRule(date: Date, rules: DailyTimeWindows[]): string {
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const matchingDayRule = rules.find((rule) => rule.weekday === weekday);

  if (!matchingDayRule) {
    return `当前仅允许 ${describeAllowedDays(rules)}`;
  }

  if (matchingDayRule.ranges.some((range) => matchesTimeRange(minutes, range))) {
    return describeDailyRule(matchingDayRule, true);
  }

  return describeDailyRule(matchingDayRule, false);
}

function matchesTimeRange(minutes: number, range: TimeRange): boolean {
  return minutes >= range.startMinutes && minutes <= range.endMinutes;
}

function describeAllowedDays(rules: DailyTimeWindows[]): string {
  return rules.map((rule) => describeDailyRule(rule, true)).join("、");
}

function describeDailyRule(rule: DailyTimeWindows, allowed: boolean): string {
  const day = weekdayLabel(rule.weekday);
  if (rule.ranges.length === 1 && isFullDay(rule.ranges[0])) {
    return `${day}全天${allowed ? "允许报名" : "不允许报名"}`;
  }

  const periods = rule.ranges.map(describeRange).join("、");
  return allowed
    ? `${day}允许时段为 ${periods}`
    : `${day}仅允许 ${periods} 报名`;
}

function isFullDay(range: TimeRange): boolean {
  return range.startMinutes === 0 && range.endMinutes === 23 * 60 + 59;
}

function describeRange(range: TimeRange): string {
  return `${formatMinutes(range.startMinutes)}-${formatMinutes(range.endMinutes)}`;
}

function weekdayLabel(weekday: number): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday] ?? `周${weekday}`;
}

function formatMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hours}:${minute}`;
}
