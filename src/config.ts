import { parseArgs } from "node:util";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import type { AppConfig, LogLevel } from "./types.js";

dotenv.config();

const logLevels = ["debug", "info", "warn", "error"] as const;

const schema = z.object({
  username: z.string().min(1, "UCAS_USERNAME is required"),
  password: z.string().min(1, "UCAS_PASSWORD is required"),
  loginUrl: z.string().url(),
  humanityLectureUrl: z.string().url(),
  statePath: z.string().min(1),
  logLevel: z.enum(logLevels),
  headless: z.boolean(),
  dryRun: z.boolean(),
  pollIntervalMs: z.number().int().min(0),
  maxCycles: z.number().int().min(1),
  captchaEnabled: z.boolean(),
  captchaLanguage: z.string().min(1),
  captchaMaxAttempts: z.number().int().min(1).max(5),
  captchaLangPath: z.string().min(1)
});

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const args = parseArgs({
    args: argv,
    options: {
      "state-path": { type: "string" },
      "login-url": { type: "string" },
      "lecture-url": { type: "string" },
      "poll-interval-ms": { type: "string" },
      "max-cycles": { type: "string" },
      "log-level": { type: "string" },
      "captcha-language": { type: "string" },
      "captcha-max-attempts": { type: "string" },
      "captcha-lang-path": { type: "string" },
      headful: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "no-dry-run": { type: "boolean" },
      "captcha-disabled": { type: "boolean" }
    },
    allowPositionals: false
  });

  const resolved = schema.parse({
    username: process.env.UCAS_USERNAME ?? "",
    password: process.env.UCAS_PASSWORD ?? "",
    loginUrl:
      args.values["login-url"] ??
      process.env.UCAS_LOGIN_URL ??
      "https://sep.ucas.ac.cn/?loginFrom=/appStore",
    humanityLectureUrl:
      args.values["lecture-url"] ??
      process.env.UCAS_HUMANITY_LECTURE_URL ??
      "https://xkcts.ucas.ac.cn:8443/subject/humanityLecture",
    statePath:
      args.values["state-path"] ?? process.env.UCAS_STATE_PATH ?? ".cache/lecture-state.json",
    logLevel:
      (args.values["log-level"] as LogLevel | undefined) ??
      (process.env.UCAS_LOG_LEVEL as LogLevel | undefined) ??
      "info",
    headless: !args.values.headful && parseBoolean(process.env.UCAS_HEADLESS, true),
    dryRun: args.values["no-dry-run"]
      ? false
      : args.values["dry-run"] || parseBoolean(process.env.UCAS_DRY_RUN, false),
    pollIntervalMs: Number(
      args.values["poll-interval-ms"] ?? process.env.UCAS_POLL_INTERVAL_MS ?? "0"
    ),
    maxCycles: Number(args.values["max-cycles"] ?? process.env.UCAS_MAX_CYCLES ?? "1"),
    captchaEnabled:
      !args.values["captcha-disabled"] && parseBoolean(process.env.UCAS_CAPTCHA_ENABLED, true),
    captchaLanguage:
      args.values["captcha-language"] ?? process.env.UCAS_CAPTCHA_LANGUAGE ?? "eng",
    captchaMaxAttempts: Number(
      args.values["captcha-max-attempts"] ?? process.env.UCAS_CAPTCHA_MAX_ATTEMPTS ?? "3"
    ),
    captchaLangPath:
      args.values["captcha-lang-path"] ??
      process.env.UCAS_CAPTCHA_LANG_PATH ??
      "https://tessdata.projectnaptha.com/4.0.0"
  });

  return {
    username: resolved.username,
    password: resolved.password,
    loginUrl: resolved.loginUrl,
    humanityLectureUrl: resolved.humanityLectureUrl,
    statePath: resolve(resolved.statePath),
    headless: resolved.headless,
    dryRun: resolved.dryRun,
    pollIntervalMs: resolved.pollIntervalMs,
    maxCycles: resolved.maxCycles,
    logLevel: resolved.logLevel,
    captcha: {
      enabled: resolved.captchaEnabled,
      language: resolved.captchaLanguage,
      maxAttempts: resolved.captchaMaxAttempts,
      langPath: resolved.captchaLangPath
    }
  };
}

function parseBoolean(input: string | undefined, defaultValue: boolean): boolean {
  if (input === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(input.toLowerCase());
}
