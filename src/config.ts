import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { z } from "zod";
import type { AppConfig, LogLevel, RunMode, TimeWindowRule } from "./types.js";

dotenv.config();

const logLevels = ["debug", "info", "warn", "error"] as const;
const runModes = ["single", "scheduled"] as const;
const defaultConfigFilePath = "ucas-bot.config.json";
const defaultLoginUrl = "https://sep.ucas.ac.cn/?loginFrom=/appStore";
const defaultLectureUrl = "https://xkcts.ucas.ac.cn:8443/subject/humanityLecture";
const defaultStatePath = ".cache/lecture-state.json";
const defaultTimeWindows = [
  { weekday: 1, start: "17:00" },
  { weekday: 2, start: "19:00" },
  { weekday: 3 }
];

const envSchema = z.object({
  username: z.string().min(1, "UCAS_USERNAME is required"),
  password: z.string().min(1, "UCAS_PASSWORD is required")
});

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
          startHour: z.number().int().min(0).max(23).optional(),
          endHour: z.number().int().min(0).max(23).optional(),
          intervalMinutes: z.number().int().min(1).optional(),
          runImmediatelyOnStart: z.boolean().optional()
        })
        .optional()
    })
    .optional(),
  captcha: z
    .object({
      enabled: z.boolean().optional(),
      language: z.string().min(1).optional(),
      maxAttempts: z.number().int().min(1).max(5).optional(),
      langPath: z.string().min(1).optional()
    })
    .optional(),
  filter: z
    .object({
      timeWindows: z
        .array(
          z.object({
            weekday: z.number().int().min(0).max(6),
            start: z.string().optional(),
            end: z.string().optional()
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

  const configPath = resolve(
    args.values.config ?? process.env.UCAS_CONFIG_PATH ?? defaultConfigFilePath
  );
  const configFileExists = existsSync(configPath);
  const rawConfig = loadConfigFile(configPath, Boolean(args.values.config) || Boolean(process.env.UCAS_CONFIG_PATH));
  const parsedFile = fileSchema.parse(rawConfig ?? {});
  const runMode = (parsedFile.runtime?.mode ?? "single") as RunMode;
  const schedule = {
    startHour: parsedFile.runtime?.schedule?.startHour ?? 8,
    endHour: parsedFile.runtime?.schedule?.endHour ?? 18,
    intervalMinutes: parsedFile.runtime?.schedule?.intervalMinutes ?? 60,
    runImmediatelyOnStart: parsedFile.runtime?.schedule?.runImmediatelyOnStart ?? true
  };

  if (schedule.endHour < schedule.startHour) {
    throw new Error("runtime.schedule.endHour must be greater than or equal to startHour");
  }

  const resolvedTimeWindows = (parsedFile.filter?.timeWindows ?? defaultTimeWindows).map(
    normalizeTimeWindowRule
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
      language: parsedFile.captcha?.language ?? "eng",
      maxAttempts: parsedFile.captcha?.maxAttempts ?? 3,
      langPath: parsedFile.captcha?.langPath ?? "https://tessdata.projectnaptha.com/4.0.0"
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

function normalizeTimeWindowRule(rule: {
  weekday: number;
  start?: string;
  end?: string;
}): TimeWindowRule {
  const startMinutes = rule.start ? parseClockTime(rule.start) : null;
  const endMinutes = rule.end ? parseClockTime(rule.end) : null;

  if (endMinutes !== null && startMinutes !== null && endMinutes < startMinutes) {
    throw new Error(`invalid time window for weekday ${rule.weekday}: end is earlier than start`);
  }

  return {
    weekday: rule.weekday,
    startMinutes,
    endMinutes
  };
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
