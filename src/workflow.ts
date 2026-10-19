import { chromium } from "playwright";
import type { AppConfig, LectureRecord, RunSummary } from "./types.js";
import { Logger } from "./log.js";
import { decideLectures, isQuotaReached } from "./filter.js";
import { extractAllLectureSnapshot, extractLectureSnapshot, extractQuotaFromRecordPage, goToLecturePage } from "./lecture-page.js";
import { ensureAuthenticated } from "./login.js";
import { getNextScheduledRun, getNextReservationCheck } from "./schedule.js";
import { registerLecture } from "./register.js";
import { loadState, markLectureTerminalState, saveState } from "./state-store.js";
import { isAllowedLectureTime, parseLectureStart } from "./time-window.js";
import { formatLocalTimestamp, sleep } from "./util.js";

export async function runAutomation(config: AppConfig, logger: Logger): Promise<RunSummary> {
  if (config.runMode === "scheduled" && !config.schedule.runImmediatelyOnStart) {
    await sleep(getNextScheduledRun(new Date(), config.schedule).getTime() - Date.now());
  }
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const state = await loadState(config.statePath);
  // The queue is reconstructed from the website on every start.
  const lectures = new Map<string, LectureRecord>();
  const previewed = new Set<string>();
  const rejected = new Set<string>();
  const summary: RunSummary = {
    cycleCount: 0, dryRun: config.dryRun, candidates: [], skipped: [], attempts: [],
    stopReason: null, quota: { bookedCount: null, requiredCount: null, rawText: null }
  };
  let nextScanAt = new Date(0);
  let polling = false;
  const merge = (incoming: LectureRecord[]): void => {
    for (const lecture of incoming) {
      const previous = lectures.get(lecture.id);
      lectures.set(lecture.id, {
        ...lecture,
        reservationOpensAt: lecture.reservationOpensAt ?? previous?.reservationOpensAt,
        reservationClosesAt: lecture.reservationClosesAt ?? previous?.reservationClosesAt
      });
    }
  };
  const watchable = (): LectureRecord[] => [...lectures.values()].filter(lecture => {
    const start = lecture.startTimeText ? parseLectureStart(lecture.startTimeText) : null;
    return !lecture.terminalState && lecture.statusText !== "预约已结束" &&
      !state.terminalLectures[lecture.id] && !previewed.has(lecture.id) && !rejected.has(lecture.id) &&
      start !== null && start.date.getTime() > Date.now() &&
      (!lecture.reservationClosesAt || Date.parse(lecture.reservationClosesAt) > Date.now()) &&
      isAllowedLectureTime(start.date, config.timeWindows);
  });
  const refreshQuota = async (): Promise<void> => {
    summary.quota = await extractQuotaFromRecordPage(page, config.humanityLectureUrl) ?? summary.quota;
    state.lastQuota = summary.quota;
  };

  try {
    while (true) {
      try {
        summary.cycleCount++;
        await ensureAuthenticated(page, config, logger);
        const fullScan = Date.now() >= nextScanAt.getTime();
        if (fullScan) {
          await page.goto(config.humanityLectureUrl, { waitUntil: "domcontentloaded" });
          await ensureAuthenticated(page, config, logger);
          const snapshot = await extractAllLectureSnapshot(page);
          const ids = new Set(snapshot.lectures.map(lecture => lecture.id));
          for (const id of lectures.keys()) if (!ids.has(id)) lectures.delete(id);
          merge(snapshot.lectures);
          summary.quota = snapshot.quota;
          if (summary.quota.bookedCount === null || summary.quota.requiredCount === null) await refreshQuota();
          state.lastQuota = summary.quota;
          nextScanAt = new Date(Date.now() + config.schedule.intervalMinutes * 60_000);
          rejected.clear();
          logger.info("run.scan", {
            lectureCount: lectures.size,
            quotaBooked: summary.quota.bookedCount, quotaRequired: summary.quota.requiredCount,
            upcoming: watchable().filter(lecture => lecture.reservationOpensAt && Date.parse(lecture.reservationOpensAt) > Date.now())
              .sort((a, b) => Date.parse(a.reservationOpensAt!) - Date.parse(b.reservationOpensAt!))
              .map(lecture => ({ id: lecture.id, title: lecture.title, opensAt: lecture.reservationOpensAt, closesAt: lecture.reservationClosesAt }))
          });
        } else {
          const duePages = new Set(watchable().filter(lecture => !lecture.terminalState && (
            lecture.actionAvailable || lecture.reservationOpensAt && Date.parse(lecture.reservationOpensAt) <= Date.now() + 10000
          )).map(lecture => lecture.pageNumber ?? 1));
          for (const number of duePages) {
            await goToLecturePage(page, number, true);
            await ensureAuthenticated(page, config, logger);
            await goToLecturePage(page, number);
            const refreshed = (await extractLectureSnapshot(page)).lectures.map(lecture => ({ ...lecture, pageNumber: number }));
            const ids = new Set(refreshed.map(lecture => lecture.id));
            // A newly inserted lecture can move a queued row onto another page.
            if (watchable().some(lecture => lecture.pageNumber === number && !ids.has(lecture.id))) nextScanAt = new Date(0);
            merge(refreshed);
          }
        }

        const decisions = decideLectures([...lectures.values()], state, new Set(), isQuotaReached(summary.quota), config.timeWindows);
        summary.skipped = decisions.filter(decision => decision.action !== "candidate");
        for (const decision of summary.skipped) {
          if (decision.lecture.terminalState) markLectureTerminalState(state, decision.lecture, decision.lecture.terminalState);
        }
        if (isQuotaReached(summary.quota)) {
          summary.stopReason = "已达到页面显示的次数要求，停止预约";
          await saveState(config.statePath, state);
          return summary;
        }
        summary.candidates = decisions.filter(decision => decision.action === "candidate").map(decision => decision.lecture);
        for (const lecture of summary.candidates) {
          if (rejected.has(lecture.id) || previewed.has(lecture.id)) continue;
          logger.info(config.dryRun ? "run.preview" : "run.register.start", {
            lectureId: lecture.id, title: lecture.title, opensAt: lecture.reservationOpensAt ?? null
          });
          if (config.dryRun) { previewed.add(lecture.id); continue; }
          const result = await registerLecture(page, lecture, logger);
          summary.attempts.push(result);
          logger.info("run.register.result", { ...result });
          if (result.outcome === "registered" || result.outcome === "already-booked") {
            markLectureTerminalState(state, lecture, "booked", result.detail);
          } else if (result.outcome === "full") {
            markLectureTerminalState(state, lecture, "full", result.detail);
          } else if (result.outcome === "rejected") {
            // Time conflicts / eligibility failures cannot be fixed by one-second retries.
            rejected.add(lecture.id);
          }
          if (result.outcome === "registered" || result.outcome === "already-booked") await refreshQuota();
          await saveState(config.statePath, state);
          if (isQuotaReached(summary.quota)) {
            summary.stopReason = "报名后达到页面显示的次数要求，停止预约";
            return summary;
          }
        }
        if (fullScan) await saveState(config.statePath, state);
        if (config.runMode === "single") {
          summary.stopReason = config.dryRun ? "单次预览完成" : "单次预约完成";
          return summary;
        }
        const next = getNextReservationCheck(watchable(), new Date(), nextScanAt);
        const fast = next.getTime() - Date.now() <= 1100;
        if (!fast || !polling) logger.info(fast ? "run.schedule.poll" : "run.schedule.sleep", {
          nextRunAt: formatLocalTimestamp(next), ...(fast ? { intervalSeconds: 1 } : {})
        });
        polling = fast;
        await sleep(Math.max(0, next.getTime() - Date.now()));
      } catch (error) {
        if (config.runMode === "single") throw error;
        logger.error("run.schedule.cycle-failed", { message: error instanceof Error ? error.message : String(error) });
        nextScanAt = new Date(0);
        await sleep(5000);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
