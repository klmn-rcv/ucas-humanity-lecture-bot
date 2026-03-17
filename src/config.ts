import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { z } from "zod";
import type {
  AppConfig,
  DailyTimeWindows,
  LogLevel,
  RunMode,
  TimeRange
} from "./types.js";

dotenv.config();

const logLevels = ["debug", "info", "warn", "error"] as const;
const runModes = ["single", "scheduled"] as const;
const defaultConfigFilePath = "ucas-bot.config.json";
const defaultLoginUrl = "https://sep.ucas.ac.cn/?loginFrom=/appStore";
const defaultLectureUrl = "https://xkcts.ucas.ac.cn:8443/subject/humanityLecture";
const defaultStatePath = ".cache/lecture-state.json";
const defaultSchedulePeriods = [["08:00", "18:00"]] as const;
const defaultTimeWindows = [
  { weekday: 1, periods: [["17:00", "23:59"]] },
  { weekday: 2, periods: [["19:00", "23:59"]] },
  { weekday: 3, periods: [["00:00", "23:59"]] }
] as const;

const envSchema = z.object({
  username: z.string().min(1, "UCAS_USERNAME is required"),
  password: z.string().min(1, "UCAS_PASSWORD is required")
});

const timePeriodSchema = z.tuple([z.string().min(1), z.string().min(1)]);

const fileSchema = z.object({
  logging: z
    .object({
      level: z.enum(logLevels).optional()
    })
    .optional(),
  targets: z
    .object({
      loginUrl: z.string().url().optional(),
      lectureUrl: z.string().url().optional()
    })
    .optional(),
  runtime: z
    .object({
      mode: z.enum(runModes).optional(),
      headless: z.boolean().optional(),
      dryRun: z.boolean().optional(),
      statePath: z.string().min(1).optional(),
      schedule: z
        .object({
          periods: z.array(timePeriodSchema).min(1).optional(),
          intervalMinutes: z.number().int().min(1).optional(),
          runImmediatelyOnStart: z.boolean().optional()
        })
        .optional()
    })
    .optional(),
  captcha: z
    .object({
      enabled: z.boolean().optional(),
      maxAttempts: z.number().int().min(1).max(5).optional(),
      pythonExecutable: z.string().min(1).optional()
    })
    .optional(),
  filter: z
    .object({
      timeWindows: z
        .array(
          z.object({
            weekday: z.number().int().min(0).max(6),
            periods: z.array(timePeriodSchema).min(1)
          })
        )
        .min(1)
        .optional()
    })
    .optional()
});

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const args = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      headful: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "no-dry-run": { type: "boolean" },
      "log-level": { type: "string" }
    },
    allowPositionals: false
  });

  const env = envSchema.parse({
    username: process.env.UCAS_USERNAME ?? "",
    password: process.env.UCAS_PASSWORD ?? ""
  });

  const configPath = resolve(args.values.config ?? defaultConfigFilePath);
  const configFileExists = existsSync(configPath);
  const rawConfig = loadConfigFile(configPath, Boolean(args.values.config));
  const parsedFile = fileSchema.parse(rawConfig ?? {});
  const runMode = (parsedFile.runtime?.mode ?? "single") as RunMode;
  const schedule = {
    periods: normalizeTimeRanges(
      parsedFile.runtime?.schedule?.periods ?? [...defaultSchedulePeriods],
      "runtime.schedule.periods"
    ),
    intervalMinutes: parsedFile.runtime?.schedule?.intervalMinutes ?? 60,
    runImmediatelyOnStart: parsedFile.runtime?.schedule?.runImmediatelyOnStart ?? true
  };
  const resolvedTimeWindows = (parsedFile.filter?.timeWindows ?? defaultTimeWindows).map((rule) =>
    normalizeDailyTimeWindows(rule, "filter.timeWindows")
  );

  return {
    configPath,
    configFileExists,
    username: env.username,
    password: env.password,
    loginUrl: parsedFile.targets?.loginUrl ?? defaultLoginUrl,
    humanityLectureUrl: parsedFile.targets?.lectureUrl ?? defaultLectureUrl,
    statePath: resolve(parsedFile.runtime?.statePath ?? defaultStatePath),
    headless: args.values.headful ? false : parsedFile.runtime?.headless ?? true,
    dryRun: args.values["no-dry-run"]
      ? false
      : args.values["dry-run"]
        ? true
        : parsedFile.runtime?.dryRun ?? false,
    runMode,
    schedule,
    timeWindows: resolvedTimeWindows,
    logLevel:
      (args.values["log-level"] as LogLevel | undefined) ??
      parsedFile.logging?.level ??
      "info",
    captcha: {
      enabled: parsedFile.captcha?.enabled ?? true,
      maxAttempts: parsedFile.captcha?.maxAttempts ?? 3,
      pythonExecutable: resolve(
        parsedFile.captcha?.pythonExecutable ?? defaultPythonExecutable()
      )
    }
  };
}

function loadConfigFile(path: string, required: boolean): unknown {
  if (!existsSync(path)) {
    if (required) {
      throw new Error(`config file not found: ${path}`);
    }

    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse config file ${path}: ${message}`);
  }
}

function normalizeDailyTimeWindows(
  rule: {
    weekday: number;
    periods: ReadonlyArray<readonly [string, string]>;
  },
  path: string
): DailyTimeWindows {
  return {
    weekday: rule.weekday,
    ranges: normalizeTimeRanges(rule.periods, `${path}[weekday=${rule.weekday}].periods`)
  };
}

function normalizeTimeRanges(
  ranges: ReadonlyArray<readonly [string, string]>,
  path: string
): TimeRange[] {
  const normalized = ranges.map(([start, end], index) => {
    const startMinutes = parseClockTime(start);
    const endMinutes = parseClockTime(end);

    if (endMinutes < startMinutes) {
      throw new Error(`${path}[${index}] end is earlier than start`);
    }

    return {
      startMinutes,
      endMinutes
    };
  });

  normalized.sort((left, right) => left.startMinutes - right.startMinutes);

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (current.startMinutes <= previous.endMinutes) {
      throw new Error(`${path} contains overlapping periods`);
    }
  }

  return normalized;
}

function parseClockTime(value: string): number {
  const matched = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) {
    throw new Error(`invalid clock time: ${value}`);
  }

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`invalid clock time: ${value}`);
  }

  return hours * 60 + minutes;
}

function defaultPythonExecutable(): string {
  return platform() === "win32"
    ? ".venv-ddddocr/Scripts/python.exe"
    : ".venv-ddddocr/bin/python";
}
