import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config loader", () => {
  it("reads public config file and keeps secrets in env", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.toml");
    writeFileSync(
      configPath,
      `
[runtime]
mode = "scheduled"
headless = true
dryRun = false
statePath = "tmp/state.json"

[runtime.schedule]
periods = [["08:00", "12:00"], ["14:00", "18:00"]]
intervalMinutes = 60
runImmediatelyOnStart = false

[logging]
level = "debug"

[captcha]
pythonExecutable = "./custom-python"
maxAttempts = 5

[[filter.timeWindows]]
weekday = 1
periods = [["17:00", "18:00"], ["20:00", "21:00"]]

[[filter.timeWindows]]
weekday = 3
periods = [["00:00", "23:59"]]
`
    );

    const config = loadConfig(["--config", configPath]);
    expect(config.runMode).toBe("scheduled");
    expect(config.schedule.runImmediatelyOnStart).toBe(false);
    expect(config.logLevel).toBe("debug");
    expect(config.humanityLectureUrl).toBe("https://jwxk.ucas.ac.cn/subject/humanityLecture");
    expect(config.statePath).toBe(resolve("tmp/state.json"));
    expect(config.schedule.periods).toEqual([
      { startMinutes: 8 * 60, endMinutes: 12 * 60 },
      { startMinutes: 14 * 60, endMinutes: 18 * 60 }
    ]);
    expect(config.captcha.pythonExecutable).toBe(resolve("./custom-python"));
    expect(config.timeWindows).toEqual([
      {
        weekday: 1,
        ranges: [
          { startMinutes: 17 * 60, endMinutes: 18 * 60 },
          { startMinutes: 20 * 60, endMinutes: 21 * 60 }
        ]
      },
      {
        weekday: 3,
        ranges: [{ startMinutes: 0, endMinutes: 23 * 60 + 59 }]
      }
    ]);
  });

  it("parses TOML config files with comments", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.toml");
    writeFileSync(
      configPath,
      `
# comments should be ignored
[runtime]
mode = "scheduled"

[runtime.schedule]
periods = [["08:00", "18:00"]]
intervalMinutes = 60
`
    );

    const config = loadConfig(["--config", configPath]);
    expect(config.runMode).toBe("scheduled");
    expect(config.schedule.periods).toEqual([{ startMinutes: 8 * 60, endMinutes: 18 * 60 }]);
  });

  it("allows temporary cli overrides on top of config files", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.toml");
    writeFileSync(
      configPath,
      `
[runtime]
dryRun = false
headless = true
`
    );

    const config = loadConfig(["--config", configPath, "--dry-run", "--headful"]);
    expect(config.dryRun).toBe(true);
    expect(config.headless).toBe(false);
  });

  it("rejects captcha retry counts above five", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.toml");
    writeFileSync(
      configPath,
      `
[captcha]
maxAttempts = 6
`
    );

    expect(() => loadConfig(["--config", configPath])).toThrow();
  });

  it("rejects overlapping schedule periods", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");

    const tempDir = mkdtempSync(join(tmpdir(), "ucas-config-"));
    const configPath = join(tempDir, "ucas-bot.config.toml");
    writeFileSync(
      configPath,
      `
[runtime.schedule]
periods = [["08:00", "12:00"], ["11:00", "18:00"]]
`
    );

    expect(() => loadConfig(["--config", configPath])).toThrow(/overlapping/);
  });
});
