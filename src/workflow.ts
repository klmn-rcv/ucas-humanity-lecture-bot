import { chromium } from "playwright";
import type {
  AppConfig,
  LectureDecision,
  RegistrationAttemptResult,
  RunSummary,
  TerminalLectureState
} from "./types.js";
import { Logger } from "./log.js";
import { decideLectures, isQuotaReached, summarizeDecisionReasonWithRules } from "./filter.js";
import { extractLectureSnapshot, extractQuotaFromRecordPage } from "./lecture-page.js";
import { ensureAuthenticated } from "./login.js";
import { isWithinScheduledWindow, getNextScheduledRun } from "./schedule.js";
import { registerLecture } from "./register.js";
import { loadState, markLectureTerminalState, saveState } from "./state-store.js";
import { formatLocalTimestamp, sleep } from "./util.js";

export async function runAutomation(config: AppConfig, logger: Logger): Promise<RunSummary> {
  if (config.runMode === "single") {
    return runAutomationCycle(config, logger, 1);
  }

  let cycle = 0;
  let hasTriggeredImmediateRun = false;
  let lastSummary = createEmptySummary(config, cycle);

  while (true) {
    const now = new Date();
    const shouldRunImmediately =
      !hasTriggeredImmediateRun &&
      config.schedule.runImmediatelyOnStart &&
      isWithinScheduledWindow(now, config.schedule);

    if (!shouldRunImmediately) {
      const nextRunAt = getNextScheduledRun(now, config.schedule);
      const sleepMs = Math.max(0, nextRunAt.getTime() - now.getTime());
      logger.info("run.schedule.sleep", {
        nextRunAt: formatLocalTimestamp(nextRunAt),
        sleepMs
      });
      await sleep(sleepMs);
    }

    cycle += 1;
    hasTriggeredImmediateRun = true;

    try {
      lastSummary = await runAutomationCycle(config, logger, cycle);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("run.schedule.cycle-failed", {
        cycle,
        message
      });
    }
  }

  return lastSummary;
}

async function runAutomationCycle(
  config: AppConfig,
  logger: Logger,
  cycle: number
): Promise<RunSummary> {
  const browser = await chromium.launch({
    headless: config.headless
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  const state = await loadState(config.statePath);
  const attempts: RegistrationAttemptResult[] = [];
  const skipped: LectureDecision[] = [];
  let stopReason: string | null = null;
  let quota = state.lastQuota ?? {
    bookedCount: null,
    requiredCount: null,
    rawText: null
  };

  try {
    logger.info("run.cycle.start", {
      cycle,
      dryRun: config.dryRun,
      runMode: config.runMode
    });

    await ensureAuthenticated(page, config, logger);
    const snapshot = await extractLectureSnapshot(page);
    const recordQuota =
      snapshot.quota.bookedCount === null || snapshot.quota.requiredCount === null
        ? await extractQuotaFromRecordPage(page, config.humanityLectureUrl)
        : null;
    quota = recordQuota ?? snapshot.quota;
    state.lastQuota = quota;

    if (isQuotaReached(quota)) {
      stopReason = "已达到页面显示的预约次数要求";
      logger.info("run.stop.quota-reached", {
        bookedCount: quota.bookedCount,
        requiredCount: quota.requiredCount
      });
      await saveState(config.statePath, state);
      return {
        cycleCount: cycle,
        dryRun: config.dryRun,
        quota,
        candidates: [],
        skipped: snapshot.lectures.map((lecture) => ({
          lecture,
          action: "stop",
          reason: "quota-reached"
        })),
        attempts,
        stopReason
      };
    }

    const seenInRun = new Set<string>();
    const decisions = decideLectures(
      snapshot.lectures,
      state,
      seenInRun,
      false,
      config.timeWindows
    );
    const cycleCandidates = decisions
      .filter((decision) => decision.action === "candidate")
      .map((decision) => decision.lecture);
    const cycleSkipped = decisions.filter((decision) => decision.action !== "candidate");
    skipped.push(...cycleSkipped);

    logger.info("run.cycle.analyzed", {
      cycle,
      lectureCount: snapshot.lectures.length,
      candidateCount: cycleCandidates.length,
      skippedCount: cycleSkipped.length,
      quotaBooked: quota.bookedCount,
      quotaRequired: quota.requiredCount
    });

    for (const decision of cycleSkipped) {
      if (decision.reason === "page-terminal-state" && decision.lecture.terminalState) {
        markLectureTerminalState(state, decision.lecture, decision.lecture.terminalState);
      }

      logger.debug("run.cycle.skip", {
        cycle,
        lectureId: decision.lecture.id,
        title: decision.lecture.title,
        reason: decision.reason,
        detail: summarizeDecisionReasonWithRules(decision, config.timeWindows)
      });
    }

    if (config.dryRun) {
      stopReason =
        config.runMode === "scheduled"
          ? "scheduled 模式下本轮仅输出候选讲座，不执行真实报名"
          : "dry-run 模式下只输出候选讲座，不执行真实报名";
      await saveState(config.statePath, state);
      return {
        cycleCount: cycle,
        dryRun: true,
        quota,
        candidates: cycleCandidates,
        skipped,
        attempts,
        stopReason
      };
    }

    for (const lecture of cycleCandidates) {
      const result = await registerLecture(page, lecture, logger);
      attempts.push(result);
      logger.info("run.register.result", { ...result });

      if (result.outcome === "registered") {
        markLectureTerminalState(state, lecture, "booked", result.detail);
      }

      if (result.outcome === "full") {
        markLectureTerminalState(state, lecture, "full", result.detail);
      }

      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
      const refreshed = await extractLectureSnapshot(page);
      const refreshedRecordQuota =
        refreshed.quota.bookedCount === null || refreshed.quota.requiredCount === null
          ? await extractQuotaFromRecordPage(page, config.humanityLectureUrl)
          : null;
      quota = refreshedRecordQuota ?? refreshed.quota;
      state.lastQuota = quota;

      if (isQuotaReached(quota)) {
        stopReason = "报名后达到预约次数要求，已自动停止";
        await saveState(config.statePath, state);
        return {
          cycleCount: cycle,
          dryRun: false,
          quota,
          candidates: cycleCandidates,
          skipped,
          attempts,
          stopReason
        };
      }
    }

    await saveState(config.statePath, state);

    return {
      cycleCount: cycle,
      dryRun: config.dryRun,
      quota,
      candidates: cycleCandidates,
      skipped,
      attempts,
      stopReason
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function createEmptySummary(config: AppConfig, cycle: number): RunSummary {
  return {
    cycleCount: cycle,
    dryRun: config.dryRun,
    quota: {
      bookedCount: null,
      requiredCount: null,
      rawText: null
    },
    candidates: [],
    skipped: [],
    attempts: [],
    stopReason: null
  };
}
