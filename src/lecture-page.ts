import type { Page } from "playwright";
import type { LecturePageSnapshot, LectureRecord, TerminalLectureState } from "./types.js";
import { extractQuota } from "./quota.js";
import { hashText, normalizeWhitespace } from "./util.js";
import { parseLectureStart } from "./time-window.js";

const rowSelector = "table tr, .table tr, tbody tr, .datagrid-row";

interface RawLectureRow {
  rowIndex: number;
  idCandidate: string;
  cells: string[];
  actionTexts: string[];
}

export async function extractLectureSnapshot(page: Page): Promise<LecturePageSnapshot> {
  await page.waitForTimeout(1000);
  const pageText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  const rawRows = await page.evaluate((selector) => {
    const rows = Array.from(document.querySelectorAll(selector));
    return rows.map((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll("th, td"))
        .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);
      const actionTexts = Array.from(
        row.querySelectorAll("a, button, input[type='button'], input[type='submit']")
      )
        .map((element) =>
          (element.textContent ?? (element as HTMLInputElement).value ?? "").replace(/\s+/g, " ").trim()
        )
        .filter(Boolean);
      const idCandidate =
        row.getAttribute("data-id") ??
        row.getAttribute("id") ??
        actionTexts.join("|") ??
        "";

      return {
        rowIndex,
        idCandidate,
        cells,
        actionTexts
      };
    });
  }, rowSelector);

  return {
    lectures: rawRows.map(normalizeLectureRow).filter((row): row is LectureRecord => row !== null),
    quota: extractQuota(pageText),
    pageText
  };
}

function normalizeLectureRow(rawRow: RawLectureRow): LectureRecord | null {
  const combinedText = normalizeWhitespace([...rawRow.cells, ...rawRow.actionTexts].join(" "));
  if (!combinedText || combinedText.length < 8) {
    return null;
  }

  const startTimeText = extractStartTimeText(rawRow.cells);
  const parsedStartTime = startTimeText ? parseLectureStart(startTimeText) : null;
  const title = inferTitle(rawRow.cells, combinedText);
  const location = inferLocation(rawRow.cells);
  const statusText = inferStatusText(combinedText);
  const terminalState = inferTerminalState(combinedText);
  const actionText = rawRow.actionTexts.find((text) => /预约|报名|选课/.test(text)) ?? null;

  return {
    id: hashText(`${rawRow.idCandidate}|${title}|${startTimeText ?? ""}|${location ?? ""}`),
    title,
    startTimeText,
    startTimeIso: parsedStartTime?.iso ?? null,
    location,
    statusText,
    summaryText: combinedText,
    actionText,
    actionAvailable: Boolean(actionText) && terminalState === null,
    terminalState,
    rowIndex: rawRow.rowIndex
  };
}

function extractStartTimeText(cells: string[]): string | null {
  return (
    cells.find((cell) =>
      /(?:\d{4}[年/-])?\d{1,2}[月/-]\d{1,2}(?:日)?(?:\s*[（(]?(?:周|星期)?[一二三四五六日天][)）]?)?\s+\d{1,2}:\d{2}/.test(
        cell
      )
    ) ?? null
  );
}

function inferTitle(cells: string[], fallback: string): string {
  const candidate =
    cells.find(
      (cell) =>
        cell.length >= 4 &&
        !/^\d+$/.test(cell) &&
        !/(?:\d{4}[年/-])?\d{1,2}[月/-]\d{1,2}/.test(cell) &&
        !/地点|教室|状态|预约|报名|已满/.test(cell)
    ) ?? fallback;

  return candidate.slice(0, 120);
}

function inferLocation(cells: string[]): string | null {
  return cells.find((cell) => /地点|教室|楼|室|报告厅|会议室/.test(cell)) ?? null;
}

function inferStatusText(text: string): string {
  if (/已预约|已报名/.test(text)) {
    return "已预约";
  }

  if (/人数已满|预约已满|名额已满|满额/.test(text)) {
    return "人数已满";
  }

  if (/预约|报名|选课/.test(text)) {
    return "可尝试报名";
  }

  return "状态未知";
}

function inferTerminalState(text: string): TerminalLectureState | null {
  if (/已预约|已报名/.test(text)) {
    return "booked";
  }

  if (/人数已满|预约已满|名额已满|满额/.test(text)) {
    return "full";
  }

  return null;
}
