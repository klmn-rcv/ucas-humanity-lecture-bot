import type { Page } from "playwright";
import type {
  LecturePageSnapshot,
  LectureRecord,
  ReservationQuota,
  TerminalLectureState
} from "./types.js";
import { extractQuota } from "./quota.js";
import { hashText, normalizeWhitespace } from "./util.js";
import { parseLectureStart } from "./time-window.js";

const rowSelector = "table tr, .table tr, tbody tr, .datagrid-row";

interface RawLectureRow {
  rowIndex: number;
  idCandidate: string;
  cells: string[];
  actionTexts: string[];
  detailHref: string | null;
}

export async function extractLectureSnapshot(page: Page): Promise<LecturePageSnapshot> {
  const pageText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  const rawRows = await page.evaluate((selector) => {
    const rows = Array.from(document.querySelectorAll(selector));
    return rows.map((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll("td"))
        .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const actionTexts = Array.from(
        row.querySelectorAll("a:not([aria-disabled='true']), button:not(:disabled), input[type='button']:not(:disabled), input[type='submit']:not(:disabled)")
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
        actionTexts,
        detailHref: row.querySelector("a[href*='humanityView']")?.getAttribute("href") ?? null
      };
    });
  }, rowSelector);

  return {
    lectures: rawRows.map(normalizeLectureRow).filter((row): row is LectureRecord => row !== null)
      .map(lecture => ({ ...lecture, pageNumber: 1 })),
    quota: extractQuota(pageText),
    pageText
  };
}

export async function getLecturePageNumber(page: Page): Promise<number> {
  return Number(await page.locator("#___num").inputValue().catch(() => "1"));
}

export async function goToLecturePage(page: Page, pageNumber: number, refresh = false): Promise<void> {
  if (await getLecturePageNumber(page) === pageNumber) {
    if (refresh) await page.reload({ waitUntil: "domcontentloaded" });
    return;
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.evaluate(number => {
      const goto = (window as unknown as { gotoPage: (number: string) => void }).gotoPage;
      if (typeof goto !== "function") throw new Error("讲座列表缺少分页跳转函数");
      goto(String(number));
    }, pageNumber)
  ]);
}

export async function extractAllLectureSnapshot(page: Page): Promise<LecturePageSnapshot> {
  await goToLecturePage(page, 1);
  const total = await page.locator(".pagination .bn-info").innerText().catch(() => "");
  const pageCount = Number(total.match(/当前页\s*\d+\s*\/\s*(\d+)/)?.[1] ?? 1);
  const snapshot = await extractLectureSnapshot(page);
  for (let number = 2; number <= pageCount; number++) {
    await goToLecturePage(page, number);
    const next = await extractLectureSnapshot(page);
    snapshot.lectures.push(...next.lectures.map(lecture => ({ ...lecture, pageNumber: number })));
  }
  snapshot.lectures = [...new Map(snapshot.lectures.map(lecture => [lecture.id, lecture])).values()];
  return snapshot;
}

export async function extractQuotaFromRecordPage(
  page: Page,
  returnUrl: string
): Promise<ReservationQuota | null> {
  const href = await page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll("a")).map((anchor) => ({
        text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: anchor.getAttribute("href") ?? ""
      }));
      const byHref = links.find((link) => link.href.includes("humanityStudent"));
      if (byHref?.href) {
        return byHref.href;
      }

      const byText = links.find((link) => link.text.includes("报名及听课记录") && link.href);
      return byText?.href ?? null;
    })
    .catch(() => null);

  const target = new URL(href ?? "/subject/humanityStudent", page.url()).toString();
  await page.goto(target, { waitUntil: "domcontentloaded" });
  const bodyText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  const quota = extractQuota(bodyText);
  await page.goto(returnUrl, { waitUntil: "domcontentloaded" });
  return quota;
}

export function normalizeLectureRow(rawRow: RawLectureRow): LectureRecord | null {
  const combinedText = normalizeWhitespace([...rawRow.cells, ...rawRow.actionTexts].join(" "));
  if (!combinedText || combinedText.length < 8 || rawRow.cells[0] === "讲座说明") {
    return null;
  }

  const startTimeText = extractStartTimeText(rawRow.cells);
  const parsedStartTime = startTimeText ? parseLectureStart(startTimeText) : null;
  const title = rawRow.cells.length >= 9 ? rawRow.cells[1] : inferTitle(rawRow.cells, combinedText);
  const location = inferLocation(rawRow.cells);
  const statusText = inferStatusText(combinedText);
  const terminalState = inferTerminalState(combinedText);
  const actionText = rawRow.actionTexts.find((text) => /^(?:立即)?(?:预约|报名|选课)$/.test(text.replace(/\s+/g, ""))) ?? null;
  const reservation = parseReservationWindow(combinedText);
  const sourceId = rawRow.detailHref?.match(/\/subject\/(\d+)\/humanityView/)?.[1];

  return {
    id: sourceId ? `humanity-${sourceId}` : hashText(`${title}|${startTimeText ?? ""}|${location ?? ""}`),
    title,
    startTimeText,
    startTimeIso: parsedStartTime?.iso ?? null,
    location,
    statusText,
    summaryText: combinedText,
    actionText,
    actionAvailable: Boolean(actionText) && terminalState === null,
    terminalState,
    rowIndex: rawRow.rowIndex,
    ...reservation
  };
}

export function parseReservationWindow(text: string): {
  reservationOpensAt: string | null; reservationClosesAt: string | null;
} {
  const dates = text.match(/预约时间\s*[:：]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*[~～至—]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
  const parse = (value?: string): string | null => {
    if (!value) return null;
    const parts = value.match(/\d+/g)!.map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3] - 8, parts[4], parts[5] ?? 0));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return { reservationOpensAt: parse(dates?.[1]), reservationClosesAt: parse(dates?.[2]) };
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
  if (/已预约|已报名|已经预约过|已经报名|报名成功|取消预约|取消报名/.test(text)) {
    return "已预约";
  }

  if (/人数已满|预约已满|名额已满|满额/.test(text)) {
    return "人数已满";
  }

  if (/预约已结束/.test(text)) {
    return "预约已结束";
  }

  if (/预约|报名|选课/.test(text)) {
    return "可尝试报名";
  }

  return "状态未知";
}

function inferTerminalState(text: string): TerminalLectureState | null {
  if (/已预约|已报名|已经预约过|已经报名|报名成功|取消预约|取消报名/.test(text)) {
    return "booked";
  }

  if (/人数已满|预约已满|名额已满|满额/.test(text)) {
    return "full";
  }

  return null;
}
