import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import { extname, resolve } from "node:path";
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
const defaultConfigFilePath = "ucas-bot.config.toml";
const legacyConfigFilePath = "ucas-bot.config.json";
const defaultLoginUrl = "https://sep.ucas.ac.cn/?loginFrom=/appStore";
const defaultLectureUrl = "https://jwxk.ucas.ac.cn/subject/humanityLecture";
const defaultStatePath = ".cache/lecture-state.json";
const defaultSchedulePeriods = [["00:00", "23:59"]] as const;
const defaultTimeWindows = Array.from({ length: 7 }, (_, weekday) => ({
  weekday, periods: [["00:00", "23:59"]] as const
}));

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

  const configPath = resolve(resolveConfigPath(args.values.config));
  const configFileExists = existsSync(configPath);
  const rawConfig = loadConfigFile(configPath, Boolean(args.values.config));
  const parsedFile = fileSchema.parse(rawConfig ?? {});
  const runMode = (parsedFile.runtime?.mode ?? "single") as RunMode;
  const schedule = {
    periods: normalizeTimeRanges(
      parsedFile.runtime?.schedule?.periods ?? [...defaultSchedulePeriods],
      "runtime.schedule.periods"
    ),
    intervalMinutes: parsedFile.runtime?.schedule?.intervalMinutes ?? 720,
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
    const raw = readFileSync(path, "utf8");
    return extname(path).toLowerCase() === ".json" ? JSON.parse(raw) : parseToml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse config file ${path}: ${message}`);
  }
}

function resolveConfigPath(cliPath?: string): string {
  if (cliPath) {
    return cliPath;
  }

  if (existsSync(defaultConfigFilePath)) {
    return defaultConfigFilePath;
  }

  if (existsSync(legacyConfigFilePath)) {
    return legacyConfigFilePath;
  }

  return defaultConfigFilePath;
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

function parseToml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentContext: Record<string, unknown> = root;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const path = line.slice(2, -2).trim().split(".");
      currentContext = appendArrayTable(root, path);
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const path = line.slice(1, -1).trim().split(".");
      currentContext = ensureTable(root, path);
      continue;
    }

    const separatorIndex = findAssignmentIndex(line);
    if (separatorIndex < 0) {
      throw new Error(`invalid TOML line: ${rawLine}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const valueText = line.slice(separatorIndex + 1).trim();
    currentContext[key] = parseTomlValue(valueText);
  }

  return root;
}

function stripTomlComment(line: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];

    if (!inString && current === "#") {
      break;
    }

    result += current;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (current === "\\") {
        isEscaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      isEscaped = false;
    }
  }

  return result;
}

function findAssignmentIndex(line: string): number {
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (current === "\\") {
        isEscaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      continue;
    }

    if (current === "=") {
      return index;
    }
  }

  return -1;
}

function parseTomlValue(value: string): unknown {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return parseTomlArray(value.slice(1, -1));
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  throw new Error(`unsupported TOML value: ${value}`);
}

function parseTomlArray(content: string): unknown[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      current += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      current += char;
      continue;
    }

    if (char === "[") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items.map((item) => parseTomlValue(item));
}

function ensureTable(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current = root;

  for (const key of path) {
    const existing = current[key];
    if (isPlainObject(existing)) {
      current = existing;
      continue;
    }

    if (Array.isArray(existing)) {
      const last = existing.at(-1);
      if (!isPlainObject(last)) {
        throw new Error(`invalid TOML table path: ${path.join(".")}`);
      }
      current = last;
      continue;
    }

    const next: Record<string, unknown> = {};
    current[key] = next;
    current = next;
  }

  return current;
}

function appendArrayTable(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const parent = ensureTable(root, path.slice(0, -1));
  const key = path[path.length - 1];
  const existing = parent[key];

  if (existing === undefined) {
    parent[key] = [];
  } else if (!Array.isArray(existing)) {
    throw new Error(`invalid TOML array table path: ${path.join(".")}`);
  }

  const entry: Record<string, unknown> = {};
  (parent[key] as unknown[]).push(entry);
  return entry;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
