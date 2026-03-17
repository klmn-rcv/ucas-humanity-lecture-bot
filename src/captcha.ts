import Tesseract from "tesseract.js";
import type { Page } from "playwright";
import { normalizeWhitespace } from "./util.js";
import type { CaptchaConfig } from "./types.js";
import { Logger } from "./log.js";

const captchaInputSelector = "input#certCode1, input[name='certCode1'], input#certCode, input[name='certCode']";
const captchaImageSelector =
  "img#code, img[src*='changePic'], img[alt*='验证码'], img[title*='验证码']";

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
  const result = await Tesseract.recognize(rawImage, config.language);
  const solvedText = normalizeCaptchaText(result.data.text);

  logger.info("captcha.solved", {
    rawText: normalizeWhitespace(result.data.text),
    solvedText
  });

  if (!solvedText) {
    throw new Error("OCR 未识别出有效验证码文本");
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
