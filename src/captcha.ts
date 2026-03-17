import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Page } from "playwright";
import { Logger } from "./log.js";
import type { CaptchaConfig } from "./types.js";
import { normalizeWhitespace, nowIso } from "./util.js";

const captchaInputSelector =
  "input#certCode1:not([type='hidden']), input[name='certCode1']:not([type='hidden']), input#certCode:not([type='hidden']), input[name='certCode']:not([type='hidden'])";
const captchaImageSelector =
  "img#code, img[src*='changePic'], img[alt*='验证码'], img[title*='验证码']";
const captchaSampleDir = resolve(".cache/captcha");
const solverScriptPath = resolve("scripts/solve-captcha.py");
const execFileAsync = promisify(execFile);
const expectedCaptchaLength = 4;

export async function captchaIsVisible(page: Page): Promise<boolean> {
  return page.locator(captchaInputSelector).first().isVisible().catch(() => false);
}

export async function solveCaptcha(
  page: Page,
  config: CaptchaConfig,
  logger: Logger
): Promise<string> {
  const input = page.locator(captchaInputSelector).first();
  const image = page.locator(captchaImageSelector).first();

  if (!(await input.isVisible().catch(() => false))) {
    throw new Error("验证码输入框未出现，无法执行 OCR");
  }

  if (!(await image.isVisible().catch(() => false))) {
    throw new Error("验证码图片未出现，无法执行 OCR");
  }

  const rawImage = await image.screenshot();
  const sample = await persistCaptchaSample(rawImage);
  const rawText = await recognizeWithDdddocr(sample.rawPath, config);
  const solvedText = normalizeCaptchaText(rawText);

  logger.info("captcha.solved", {
    engine: "ddddocr",
    rawText: normalizeWhitespace(rawText),
    solvedText,
    sampleBaseName: sample.sampleBaseName
  });

  if (solvedText.length !== expectedCaptchaLength) {
    throw new Error(`OCR 未识别出 ${expectedCaptchaLength} 位有效验证码`);
  }

  await input.fill(solvedText);
  return solvedText;
}

export async function refreshCaptcha(page: Page, logger: Logger): Promise<void> {
  const image = page.locator(captchaImageSelector).first();
  if (await image.isVisible().catch(() => false)) {
    await image.click().catch(() => undefined);
    logger.info("captcha.refresh.clicked");
    await page.waitForTimeout(800);
    return;
  }

  const changed = await page
    .evaluate(() => {
      const maybeChange = (globalThis as { changeimg?: () => void }).changeimg;
      if (typeof maybeChange === "function") {
        maybeChange();
        return true;
      }

      return false;
    })
    .catch(() => false);

  logger.info("captcha.refresh.fallback", { changed });
  await page.waitForTimeout(800);
}

function normalizeCaptchaText(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, "").trim();
}

async function persistCaptchaSample(
  rawImage: Buffer
): Promise<{ sampleBaseName: string; rawPath: string }> {
  await mkdir(captchaSampleDir, { recursive: true });
  const sampleBaseName = nowIso().replace(/[:.]/g, "-");
  const rawPath = join(captchaSampleDir, `${sampleBaseName}-raw.png`);
  await writeFile(rawPath, rawImage);
  return { sampleBaseName, rawPath };
}

async function recognizeWithDdddocr(imagePath: string, config: CaptchaConfig): Promise<string> {
  if (!config.enabled) {
    throw new Error("登录页出现验证码，但当前配置禁用了验证码识别");
  }

  await access(config.pythonExecutable, constants.X_OK).catch(() => {
    throw new Error(`ddddocr Python 不可执行: ${config.pythonExecutable}`);
  });
  await access(solverScriptPath, constants.R_OK).catch(() => {
    throw new Error(`ddddocr 脚本不存在: ${solverScriptPath}`);
  });

  const { stdout, stderr } = await execFileAsync(
    config.pythonExecutable,
    [solverScriptPath, imagePath],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(stdout) as Array<{ image?: string; text?: string }>;
  const rawText = parsed[0]?.text ?? "";
  const solvedText = normalizeCaptchaText(rawText);

  if (!solvedText) {
    throw new Error(`ddddocr 未返回有效文本: ${normalizeWhitespace(stderr ?? "")}`);
  }

  return rawText;
}
