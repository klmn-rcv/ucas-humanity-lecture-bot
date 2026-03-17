import type { Page } from "playwright";
import type { AppConfig } from "./types.js";
import { Logger } from "./log.js";
import { captchaIsVisible, refreshCaptcha, solveCaptcha } from "./captcha.js";
import { normalizeWhitespace } from "./util.js";

const loginFormSelector = "#userName1, input[name='userName1']";
const manualVerificationWaitMs = 10 * 60 * 1000;
const manualVerificationUrlPatterns = ["/user/userVisit"];
const manualVerificationKeywords = [
  "新设备",
  "邮箱验证",
  "验证邮箱",
  "邮箱验证码",
  "邮件验证码",
  "发送验证码",
  "安全验证"
];

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
      await handleManualVerificationIfNeeded(page, config, logger);

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
    await page.waitForTimeout(3000);
    const portalHref = await findHumanityPortalHref(page);
    if (!portalHref) {
      const title = normalizeWhitespace(await page.title().catch(() => ""));
      const bodyText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
      throw new Error(
        `SEP 门户页中未找到“人文讲座报名”入口，无法建立讲座系统会话；url=${page.url()} title=${title} body=${bodyText.slice(0, 240)}`
      );
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
  const href = await page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"))
        .map((anchor) => ({
          text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
          href: anchor.getAttribute("href")?.trim() ?? ""
        }))
        .filter((link) => link.href);

      const byText = links.find((link) => link.text.includes("人文讲座报名"));
      if (byText?.href) {
        return byText.href;
      }

      const byHref = links.find(
        (link) =>
          link.href.includes("humanityNotice") ||
          link.href.includes("humanityLecture") ||
          link.href.includes("xkcts.ucas.ac.cn")
      );
      return byHref?.href ?? null;
    })
    .catch(() => null);

  return href && href.trim() ? href.trim() : null;
}

async function handleManualVerificationIfNeeded(
  page: Page,
  config: AppConfig,
  logger: Logger
): Promise<void> {
  const initialSurface = await findManualVerificationSurface(page);
  if (!initialSurface) {
    return;
  }

  logger.warn("auth.manual-verification-required", {
    url: initialSurface.url,
    title: initialSurface.title,
    snippet: initialSurface.snippet
  });

  if (config.headless) {
    throw new Error(
      `检测到需要人工完成的新设备/邮箱验证，但当前是 headless 模式；url=${initialSurface.url} title=${initialSurface.title}`
    );
  }

  logger.info("auth.manual-verification-wait", {
    timeoutMs: manualVerificationWaitMs
  });

  const deadline = Date.now() + manualVerificationWaitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);

    const activeSurface = await findManualVerificationSurface(page);
    if (!activeSurface) {
      logger.info("auth.manual-verification-cleared", {
        url: page.url()
      });
      return;
    }
  }

  throw new Error(`等待邮箱/新设备验证超时（${manualVerificationWaitMs}ms）`);
}

async function findManualVerificationSurface(
  page: Page
): Promise<{ url: string; title: string; snippet: string } | null> {
  const pages = page
    .context()
    .pages()
    .filter((candidate) => !candidate.isClosed());

  for (const candidate of pages) {
    const url = candidate.url();
    const title = normalizeWhitespace(await candidate.title().catch(() => ""));
    const bodyText = normalizeWhitespace(await candidate.locator("body").innerText().catch(() => ""));
    const haystack = `${title} ${bodyText}`;

    if (!isManualVerificationSurface(url, haystack)) {
      continue;
    }

    return {
      url,
      title,
      snippet: bodyText.slice(0, 240)
    };
  }

  return null;
}

export function isManualVerificationSurface(url: string, haystack: string): boolean {
  if (manualVerificationUrlPatterns.some((pattern) => url.includes(pattern))) {
    return true;
  }

  if (url.includes("/appStore")) {
    return false;
  }

  return manualVerificationKeywords.some((keyword) => haystack.includes(keyword));
}
