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

export function isAllowedLectureTime(date: Date): boolean {
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (weekday === 1) {
    return minutes >= 17 * 60;
  }

  if (weekday === 2) {
    return minutes >= 19 * 60;
  }

  if (weekday === 3) {
    return true;
  }

  return false;
}

export function explainTimeRule(date: Date): string {
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (weekday === 1) {
    return minutes >= 17 * 60 ? "周一17:00后允许报名" : "周一17:00前不允许报名";
  }

  if (weekday === 2) {
    return minutes >= 19 * 60 ? "周二19:00后允许报名" : "周二19:00前不允许报名";
  }

  if (weekday === 3) {
    return "周三全天允许报名";
  }

  return "仅允许周一晚间、周二晚间和周三讲座";
}
