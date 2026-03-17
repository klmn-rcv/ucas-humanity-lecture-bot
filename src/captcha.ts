import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import Tesseract from "tesseract.js";
import type { Page } from "playwright";
import { normalizeWhitespace, nowIso } from "./util.js";
import type { CaptchaConfig } from "./types.js";
import { Logger } from "./log.js";

// SEP 页面同时包含隐藏字段 certCode 和可见输入框 certCode1；这里必须跳过 hidden input。
const captchaInputSelector =
  "input#certCode1:not([type='hidden']), input[name='certCode1']:not([type='hidden']), input#certCode:not([type='hidden']), input[name='certCode']:not([type='hidden'])";
const captchaImageSelector =
  "img#code, img[src*='changePic'], img[alt*='验证码'], img[title*='验证码']";
const execFileAsync = promisify(execFile);
const tessdataCacheDir = resolve(".cache/tessdata");
const captchaSampleDir = resolve(".cache/captcha");
const ddddocrPythonPath = resolve(".venv-ddddocr/bin/python");
const ddddocrScriptPath = resolve("scripts/ddddocr-experiment.py");
const captchaWhitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const expectedCaptchaLength = 4;
type CaptchaVariantName =
  | "processed"
  | "raw"
  | "segmented-processed"
  | "segmented-raw"
  | "ddddocr-raw";
interface CaptchaCandidate {
  variant: CaptchaVariantName;
  rawText: string;
  confidence: number;
  solvedText: string;
}

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
  const rendered = await renderCaptchaArtifacts(page);
  const sample = await persistCaptchaSamples(rawImage, rendered.processedImage);
  const langPath = await resolveCaptchaLangPath(config, logger);
  const variants: CaptchaCandidate[] = [
    await recognizeVariant(rendered.processedImage, config, langPath, "processed"),
    await recognizeVariant(rawImage, config, langPath, "raw"),
    await recognizeSegmentedVariant(
      rendered.segmentedProcessedImages,
      config,
      langPath,
      "segmented-processed"
    ),
    await recognizeSegmentedVariant(rendered.segmentedRawImages, config, langPath, "segmented-raw")
  ];
  const ddddocrCandidate = await recognizeDdddocrVariant(sample.rawPath, variants, logger);
  if (ddddocrCandidate) {
    variants.push(ddddocrCandidate);
  }
  const best = selectBestCaptchaCandidate(variants);
  const solvedText = normalizeCaptchaText(best.rawText);

  logger.info("captcha.solved", {
    rawText: normalizeWhitespace(best.rawText),
    solvedText,
    confidence: best.confidence,
    variant: best.variant,
    alternatives: variants.map((variant) => ({
      variant: variant.variant,
      rawText: normalizeWhitespace(variant.rawText),
      solvedText: variant.solvedText,
      confidence: variant.confidence
    })),
    sampleBaseName: sample.sampleBaseName
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

async function recognizeVariant(
  image: Buffer,
  config: CaptchaConfig,
  langPath: string,
  variant: "processed" | "raw"
): Promise<CaptchaCandidate> {
  const worker = await Tesseract.createWorker(config.language, 1, {
    langPath,
    cachePath: tessdataCacheDir,
    gzip: true
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
      tessedit_char_whitelist: captchaWhitelist
    });

    const result = await worker.recognize(image);
    const rawText = normalizeWhitespace(result.data.text);
    return {
      variant,
      rawText,
      confidence: result.data.confidence ?? 0,
      solvedText: normalizeCaptchaText(rawText)
    };
  } finally {
    await worker.terminate();
  }
}

function selectBestCaptchaCandidate(
  variants: CaptchaCandidate[]
): CaptchaCandidate {
  const ranked = [...variants].sort((left, right) => {
    const leftScore = scoreCaptchaCandidate(left, variants);
    const rightScore = scoreCaptchaCandidate(right, variants);
    return rightScore - leftScore;
  });

  return ranked[0];
}

function scoreCaptchaCandidate(candidate: CaptchaCandidate, allCandidates: CaptchaCandidate[]): number {
  let score = 0;

  if (candidate.solvedText.length === expectedCaptchaLength) {
    score += 1000;
  } else {
    score -= Math.abs(candidate.solvedText.length - expectedCaptchaLength) * 200;
  }

  if (candidate.variant === "processed") {
    score += 500;
  }

  if (candidate.variant === "segmented-processed") {
    score += 700;
  }

  if (candidate.variant === "segmented-raw") {
    score += 650;
  }

  if (candidate.variant === "ddddocr-raw") {
    score += 850;
  }

  score += Math.min(candidate.confidence, 100);
  score += calculateAgreementBonus(candidate, allCandidates);

  return score;
}

function calculateAgreementBonus(candidate: CaptchaCandidate, allCandidates: CaptchaCandidate[]): number {
  if (candidate.solvedText.length !== expectedCaptchaLength) {
    return 0;
  }

  let bonus = 0;
  for (const other of allCandidates) {
    if (other === candidate || other.solvedText.length !== expectedCaptchaLength) {
      continue;
    }

    for (let index = 0; index < expectedCaptchaLength; index += 1) {
      const left = candidate.solvedText[index];
      const right = other.solvedText[index];
      if (left === right) {
        bonus += 60;
        continue;
      }

      if (left.toLowerCase() === right.toLowerCase()) {
        bonus += 40;
        continue;
      }

      if (areSimilarCaptchaChars(left, right)) {
        bonus += 25;
      }
    }
  }

  return bonus;
}

function areSimilarCaptchaChars(left: string, right: string): boolean {
  const groups = ["0OoQ", "1Il", "2Zz", "5Ss", "6G", "8B"];
  return groups.some((group) => group.includes(left) && group.includes(right));
}

async function resolveCaptchaLangPath(config: CaptchaConfig, logger: Logger): Promise<string> {
  if (!/^https?:\/\//.test(config.langPath)) {
    return config.langPath;
  }

  const normalizedBase = config.langPath.replace(/\/$/, "");
  const targetFile = join(tessdataCacheDir, `${config.language}.traineddata.gz`);

  try {
    await access(targetFile, constants.R_OK);
    logger.info("captcha.lang.cached", { targetFile });
    return tessdataCacheDir;
  } catch {
    await mkdir(tessdataCacheDir, { recursive: true });
    const sourceUrl = `${normalizedBase}/${config.language}.traineddata.gz`;
    logger.info("captcha.lang.download", { sourceUrl, targetFile });
    await execFileAsync("curl", ["-fsSL", sourceUrl, "-o", targetFile]);
    return tessdataCacheDir;
  }
}

async function renderCaptchaArtifacts(
  page: Page
): Promise<{
  processedImage: Buffer;
  segmentedProcessedImages: Buffer[];
  segmentedRawImages: Buffer[];
}> {
  const rendered = await page.evaluate((selector) => {
    const image = document.querySelector(selector) as HTMLImageElement | null;
    if (!image) {
      return null;
    }

    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = canvas.width;
    rawCanvas.height = canvas.height;
    const rawContext = rawCanvas.getContext("2d");
    if (!rawContext) {
      return null;
    }

    rawContext.imageSmoothingEnabled = false;
    rawContext.drawImage(image, 0, 0, rawCanvas.width, rawCanvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const output = luminance > 160 ? 255 : 0;
      imageData.data[index] = output;
      imageData.data[index + 1] = output;
      imageData.data[index + 2] = output;
      imageData.data[index + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
    const blackCounts: number[] = [];
    for (let x = 0; x < canvas.width; x += 1) {
      let count = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        const index = (y * canvas.width + x) * 4;
        if (imageData.data[index] < 128) {
          count += 1;
        }
      }
      blackCounts.push(count);
    }

    const targetChars = 4;
    const minCharWidth = Math.max(1, Math.floor(canvas.width / 8));
    const cuts: number[] = [];
    let start = 0;

    for (let cutIndex = 1; cutIndex < targetChars; cutIndex += 1) {
      const ideal = Math.floor((canvas.width * cutIndex) / targetChars);
      const searchStart = Math.max(start + minCharWidth, ideal - Math.floor(canvas.width / 10));
      const searchEnd = Math.min(
        canvas.width - (targetChars - cutIndex) * minCharWidth,
        ideal + Math.floor(canvas.width / 10)
      );

      let bestX = ideal;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let x = searchStart; x <= searchEnd; x += 1) {
        const score = blackCounts[x] ?? 0;
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
        }
      }

      cuts.push(bestX);
      start = bestX;
    }

    const ranges = [0, ...cuts, canvas.width];
    const processedSegments = ranges.slice(0, -1).map((rangeStart, index) => {
      const left = Math.max(0, rangeStart - 2);
      const right = Math.min(canvas.width, ranges[index + 1] + 2);
      const segmentWidth = Math.max(1, right - left);
      const segmentCanvas = document.createElement("canvas");
      segmentCanvas.width = segmentWidth;
      segmentCanvas.height = canvas.height;
      const segmentContext = segmentCanvas.getContext("2d");
      if (!segmentContext) {
        return null;
      }

      segmentContext.drawImage(
        canvas,
        left,
        0,
        segmentWidth,
        canvas.height,
        0,
        0,
        segmentWidth,
        canvas.height
      );
      return segmentCanvas.toDataURL("image/png");
    });
    const rawSegments = ranges.slice(0, -1).map((rangeStart, index) => {
      const left = Math.max(0, rangeStart - 2);
      const right = Math.min(canvas.width, ranges[index + 1] + 2);
      const segmentWidth = Math.max(1, right - left);
      const segmentCanvas = document.createElement("canvas");
      segmentCanvas.width = segmentWidth;
      segmentCanvas.height = canvas.height;
      const segmentContext = segmentCanvas.getContext("2d");
      if (!segmentContext) {
        return null;
      }

      segmentContext.drawImage(
        rawCanvas,
        left,
        0,
        segmentWidth,
        canvas.height,
        0,
        0,
        segmentWidth,
        canvas.height
      );
      return segmentCanvas.toDataURL("image/png");
    });

    return {
      processed: canvas.toDataURL("image/png"),
      processedSegments,
      rawSegments
    };
  }, captchaImageSelector);

  if (!rendered) {
    throw new Error("验证码图片预处理失败");
  }

  return {
    processedImage: Buffer.from(rendered.processed.replace(/^data:image\/png;base64,/, ""), "base64"),
    segmentedProcessedImages: rendered.processedSegments
      .filter((segment): segment is string => Boolean(segment))
      .map((segment) => Buffer.from(segment.replace(/^data:image\/png;base64,/, ""), "base64"))
      .filter((segment) => segment.length > 0),
    segmentedRawImages: rendered.rawSegments
      .filter((segment): segment is string => Boolean(segment))
      .map((segment) => Buffer.from(segment.replace(/^data:image\/png;base64,/, ""), "base64"))
      .filter((segment) => segment.length > 0)
  };
}

async function persistCaptchaSamples(
  rawImage: Buffer,
  processedImage: Buffer
): Promise<{ sampleBaseName: string; rawPath: string; processedPath: string }> {
  await mkdir(captchaSampleDir, { recursive: true });
  const sampleBaseName = nowIso().replace(/[:.]/g, "-");
  const rawPath = join(captchaSampleDir, `${sampleBaseName}-raw.png`);
  const processedPath = join(captchaSampleDir, `${sampleBaseName}-processed.png`);
  await writeFile(rawPath, rawImage);
  await writeFile(processedPath, processedImage);
  return { sampleBaseName, rawPath, processedPath };
}

async function recognizeSegmentedVariant(
  images: Buffer[],
  config: CaptchaConfig,
  langPath: string,
  variant: "segmented-processed" | "segmented-raw"
): Promise<CaptchaCandidate> {
  const chars: string[] = [];
  let totalConfidence = 0;

  for (const image of images) {
    const worker = await Tesseract.createWorker(config.language, 1, {
      langPath,
      cachePath: tessdataCacheDir,
      gzip: true
    });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
        tessedit_char_whitelist: captchaWhitelist
      });

      const result = await worker.recognize(image);
      const normalized = normalizeCaptchaText(result.data.text);
      chars.push(normalized.slice(0, 1));
      totalConfidence += result.data.confidence ?? 0;
    } finally {
      await worker.terminate();
    }
  }

  const rawText = chars.join("");
  return {
    variant,
    rawText,
    solvedText: rawText,
    confidence: images.length > 0 ? totalConfidence / images.length : 0
  };
}

async function recognizeDdddocrVariant(
  imagePath: string,
  peers: CaptchaCandidate[],
  logger: Logger
): Promise<CaptchaCandidate | null> {
  try {
    await access(ddddocrPythonPath, constants.X_OK);
    await access(ddddocrScriptPath, constants.R_OK);
  } catch {
    return null;
  }

  const { stdout } = await execFileAsync(ddddocrPythonPath, [ddddocrScriptPath, imagePath]);
  const parsed = JSON.parse(stdout) as Array<{ image?: string; text?: string }>;
  const rawText = normalizeWhitespace(parsed[0]?.text ?? "");
  if (!rawText) {
    logger.warn("captcha.ddddocr-empty", { imagePath });
    return null;
  }

  const harmonized = harmonizeCaptchaCase(rawText, peers);

  return {
    variant: "ddddocr-raw",
    rawText: harmonized,
    solvedText: normalizeCaptchaText(harmonized),
    confidence: 85
  };
}

function harmonizeCaptchaCase(text: string, peers: CaptchaCandidate[]): string {
  if (!text) {
    return text;
  }

  return text
    .split("")
    .map((char, index) => {
      const matches = peers
        .map((peer) => peer.solvedText[index] ?? "")
        .filter((peerChar) => peerChar && peerChar.toLowerCase() === char.toLowerCase());

      if (matches.length === 0) {
        return char;
      }

      const uppercaseMatches = matches.filter(
        (peerChar) => peerChar === peerChar.toUpperCase() && peerChar !== peerChar.toLowerCase()
      ).length;
      const lowercaseMatches = matches.filter(
        (peerChar) => peerChar === peerChar.toLowerCase() && peerChar !== peerChar.toUpperCase()
      ).length;

      if (uppercaseMatches > lowercaseMatches) {
        return char.toUpperCase();
      }

      if (lowercaseMatches > uppercaseMatches) {
        return char.toLowerCase();
      }

      return matches[0];
    })
    .join("");
}
