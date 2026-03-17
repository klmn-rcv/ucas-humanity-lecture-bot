import type { Page } from "playwright";
import type { AppConfig } from "./types.js";
import { Logger } from "./log.js";
import { captchaIsVisible, refreshCaptcha, solveCaptcha } from "./captcha.js";
import { normalizeWhitespace } from "./util.js";

const loginFormSelector = "#userName1, input[name='userName1']";

export async function ensureAuthenticated(page: Page, config: AppConfig, logger: Logger): Promise<void> {
  await page.goto(config.humanityLectureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  if (await isLecturePage(page)) {
    logger.info("auth.already-valid");
    return;
  }

  for (let attempt = 1; attempt <= config.captcha.maxAttempts; attempt += 1) {
    await openLoginPageIfNeeded(page, config);
    if (await isLoginPage(page)) {
      await fillLoginForm(page, config, logger, attempt);
      await submitLogin(page);
      await page.waitForTimeout(1500);

      if (await isLoginPage(page)) {
        const errorText = await collectLoginError(page);
        logger.warn("auth.login-still-open", { attempt, errorText });

        if (await captchaIsVisible(page)) {
          await refreshCaptcha(page, logger);
        }

        continue;
      }
    } else {
      logger.info("auth.sep-session-reused", { attempt, url: page.url() });
    }

    await establishLectureSession(page, config, logger);

    if (await isLecturePage(page)) {
      logger.info("auth.success", { attempt });
      return;
    }

    logger.warn("auth.redirected-unexpectedly", { attempt, url: page.url() });
  }

  throw new Error("登录失败：超过最大尝试次数，可能是凭据错误、验证码识别失败或站点策略限制");
}

async function openLoginPageIfNeeded(page: Page, config: AppConfig): Promise<void> {
  if ((await isLoginPage(page)) || (await isAppStorePage(page))) {
    return;
  }

  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

async function fillLoginForm(
  page: Page,
  config: AppConfig,
  logger: Logger,
  attempt: number
): Promise<void> {
  await page.locator("#userName1").fill(config.username);
  await page.locator("#pwd1").fill(config.password);
  logger.info("auth.form-filled", { attempt });

  if (await captchaIsVisible(page)) {
    if (!config.captcha.enabled) {
      throw new Error("登录页出现验证码，但当前配置禁用了验证码识别");
    }

    logger.info("captcha.detected", { attempt });
    await solveCaptcha(page, config.captcha, logger);
  }
}

async function submitLogin(page: Page): Promise<void> {
  const submitButton = page.locator("#sb1").first();
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
    return;
  }

  await page.keyboard.press("Enter");
}

async function collectLoginError(page: Page): Promise<string> {
  const texts = await page
    .locator(".error, .alert, #messageBox, .help-block")
    .allInnerTexts()
    .catch(() => []);

  return normalizeWhitespace(texts.join(" "));
}

async function isLoginPage(page: Page): Promise<boolean> {
  return page.locator(loginFormSelector).first().isVisible().catch(() => false);
}

async function isLecturePage(page: Page): Promise<boolean> {
  if (page.url().includes("/subject/humanityLecture") && !(await isSessionExpiredPage(page))) {
    return true;
  }

  const title = normalizeWhitespace(await page.title().catch(() => ""));
  if (title.includes("人文") || title.includes("讲座")) {
    return true;
  }

  return false;
}

async function isSessionExpiredPage(page: Page): Promise<boolean> {
  const bodyText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  return bodyText.includes("你的会话已失效") || bodyText.includes("请重新登录");
}

async function isAppStorePage(page: Page): Promise<boolean> {
  const url = page.url();
  return url.includes("/appStore") || url.includes("/appStoreStudent");
}

async function establishLectureSession(page: Page, config: AppConfig, logger: Logger): Promise<void> {
  if (!(await isAppStorePage(page))) {
    await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  }

  if (await isAppStorePage(page)) {
    const portalHref = await findHumanityPortalHref(page);
    if (!portalHref) {
      throw new Error("SEP 门户页中未找到“人文讲座报名”入口，无法建立讲座系统会话");
    }

    const resolved = new URL(portalHref, page.url()).toString();
    logger.info("auth.portal-entry", { portalHref: resolved });
    await page.goto(resolved, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  }

  await page.goto(config.humanityLectureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

async function findHumanityPortalHref(page: Page): Promise<string | null> {
  const locator = page.locator("a").filter({ hasText: "人文讲座报名" }).first();
  const href = await locator.getAttribute("href").catch(() => null);
  return href && href.trim() ? href.trim() : null;
}
