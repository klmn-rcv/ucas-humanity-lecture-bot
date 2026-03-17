import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config loader", () => {
  it("reads public config file and keeps secrets in env", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          runtime: {
            mode: "scheduled",
            headless: true,
            dryRun: false,
            statePath: "tmp/state.json",
            schedule: {
              startHour: 8,
              endHour: 18,
              intervalMinutes: 60,
              runImmediatelyOnStart: false
            }
          },
          logging: {
            level: "debug"
          },
          captcha: {
            langPath: "https://example.com/tessdata",
            maxAttempts: 5
          },
          filter: {
            timeWindows: [
              { weekday: 1, start: "17:00" },
              { weekday: 3 }
            ]
          }
        },
        null,
        2
      )
    );

    const config = loadConfig(["--config", configPath]);
    expect(config.runMode).toBe("scheduled");
    expect(config.schedule.runImmediatelyOnStart).toBe(false);
    expect(config.logLevel).toBe("debug");
    expect(config.statePath.endsWith("tmp/state.json")).toBe(true);
    expect(config.captcha.langPath).toBe("https://example.com/tessdata");
    expect(config.timeWindows).toEqual([
      { weekday: 1, startMinutes: 17 * 60, endMinutes: null },
      { weekday: 3, startMinutes: null, endMinutes: null }
    ]);
  });

  it("allows temporary cli overrides on top of config files", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          runtime: {
            dryRun: false,
            headless: true
          }
        },
        null,
        2
      )
    );

    const config = loadConfig(["--config", configPath, "--dry-run", "--headful"]);
    expect(config.dryRun).toBe(true);
    expect(config.headless).toBe(false);
  });

  it("rejects captcha retry counts above five", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          captcha: {
            maxAttempts: 6
          }
        },
        null,
        2
      )
    );

    expect(() => loadConfig(["--config", configPath])).toThrow();
  });
});
