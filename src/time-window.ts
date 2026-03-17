import type { TimeWindowRule } from "./types.js";
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

export function isAllowedLectureTime(date: Date, rules: TimeWindowRule[]): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return rules.some((rule) => matchesTimeWindow(date.getDay(), minutes, rule));
}

export function explainTimeRule(date: Date, rules: TimeWindowRule[]): string {
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const matchingDayRules = rules.filter((rule) => rule.weekday === weekday);

  if (matchingDayRules.length === 0) {
    return `当前仅允许 ${describeAllowedDays(rules)}`;
  }

  const allowedRule = matchingDayRules.find((rule) => matchesTimeWindow(weekday, minutes, rule));
  if (allowedRule) {
    return describeWindow(allowedRule, true);
  }

  return describeWindow(matchingDayRules[0], false);
}

function matchesTimeWindow(weekday: number, minutes: number, rule: TimeWindowRule): boolean {
  if (rule.weekday !== weekday) {
    return false;
  }

  if (rule.startMinutes !== null && minutes < rule.startMinutes) {
    return false;
  }

  if (rule.endMinutes !== null && minutes > rule.endMinutes) {
    return false;
  }

  return true;
}

function describeAllowedDays(rules: TimeWindowRule[]): string {
  return rules.map((rule) => describeWindow(rule, true)).join("、");
}

function describeWindow(rule: TimeWindowRule, allowed: boolean): string {
  const day = weekdayLabel(rule.weekday);

  if (rule.startMinutes === null && rule.endMinutes === null) {
    return `${day}全天${allowed ? "允许报名" : "不允许报名"}`;
  }

  if (rule.startMinutes !== null && rule.endMinutes === null) {
    return `${day}${formatMinutes(rule.startMinutes)}后${allowed ? "允许报名" : "前不允许报名"}`;
  }

  if (rule.startMinutes === null && rule.endMinutes !== null) {
    return `${day}${formatMinutes(rule.endMinutes)}前${allowed ? "允许报名" : "后不允许报名"}`;
  }

  return `${day}${formatMinutes(rule.startMinutes!)}-${formatMinutes(rule.endMinutes!)}${
    allowed ? "允许报名" : "之外不允许报名"
  }`;
}

function weekdayLabel(weekday: number): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday] ?? `周${weekday}`;
}

function formatMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hours}:${minute}`;
}
