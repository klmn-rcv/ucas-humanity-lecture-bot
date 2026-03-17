import { loadConfig } from "./config.js";
import { Logger } from "./log.js";
import { runAutomation } from "./workflow.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);

  logger.info("app.start", {
    configPath: config.configPath,
    configFileExists: config.configFileExists,
    runMode: config.runMode,
    dryRun: config.dryRun,
    headless: config.headless,
    statePath: config.statePath,
    schedule: config.schedule,
    timeWindowDayCount: config.timeWindows.length,
    timeWindowRangeCount: config.timeWindows.reduce((count, rule) => count + rule.ranges.length, 0)
  });

  const summary = await runAutomation(config, logger);

  logger.info("app.summary", {
    cycleCount: summary.cycleCount,
    dryRun: summary.dryRun,
    candidateCount: summary.candidates.length,
    skippedCount: summary.skipped.length,
    attemptCount: summary.attempts.length,
    stopReason: summary.stopReason,
    quotaBooked: summary.quota.bookedCount,
    quotaRequired: summary.quota.requiredCount
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "app.crash",
      message
    })
  );
  process.exitCode = 1;
});
