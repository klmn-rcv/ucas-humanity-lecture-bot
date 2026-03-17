import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import Tesseract from "tesseract.js";

const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error("usage: node scripts/ocr-experiment.mjs <captcha-png>");
}

const resolvedInput = resolve(inputPath);
const outDir = resolve(".cache/captcha/experiments", basename(resolvedInput, ".png"));
await mkdir(outDir, { recursive: true });
const img = await readFile(resolvedInput);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const dataUrl = `data:image/png;base64,${img.toString("base64")}`;

const variants = await page.evaluate(async (src) => {
  const load = () =>
    new Promise((resolvePromise, reject) => {
      const image = new Image();
      image.onload = () => resolvePromise(image);
      image.onerror = reject;
      image.src = src;
    });

  const image = await load();

  const make = (name, fn) => {
    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas 2d context unavailable");
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imgd = ctx.getImageData(0, 0, canvas.width, canvas.height);
    fn(imgd, canvas.width, canvas.height);
    ctx.putImageData(imgd, 0, 0);
    return { name, dataUrl: canvas.toDataURL("image/png") };
  };

  const threshold = (imgd) => {
    for (let i = 0; i < imgd.data.length; i += 4) {
      const r = imgd.data[i];
      const g = imgd.data[i + 1];
      const b = imgd.data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const out = lum > 160 ? 255 : 0;
      imgd.data[i] = out;
      imgd.data[i + 1] = out;
      imgd.data[i + 2] = out;
      imgd.data[i + 3] = 255;
    }
  };

  const removeHorizontal = (imgd, w, h) => {
    threshold(imgd);
    const data = imgd.data;
    const idx = (x, y) => (y * w + x) * 4;
    const black = (x, y) => data[idx(x, y)] < 128;
    const setWhite = (x, y) => {
      const i = idx(x, y);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = 255;
    };

    for (let y = 0; y < h; y++) {
      let runStart = -1;
      for (let x = 0; x <= w; x++) {
        const isBlack = x < w && black(x, y);
        if (isBlack && runStart === -1) {
          runStart = x;
        }
        if ((!isBlack || x === w) && runStart !== -1) {
          const runLen = x - runStart;
          if (runLen >= 12) {
            for (let rx = runStart; rx < x; rx++) {
              const up = y > 0 && black(rx, y - 1);
              const down = y + 1 < h && black(rx, y + 1);
              if (!(up && down)) {
                setWhite(rx, y);
              }
            }
          }
          runStart = -1;
        }
      }
    }
  };

  const removeHorizontalDilate = (imgd, w, h) => {
    removeHorizontal(imgd, w, h);
    const copy = new Uint8ClampedArray(imgd.data);
    const idx = (x, y) => (y * w + x) * 4;
    const black = (arr, x, y) => arr[idx(x, y)] < 128;
    const setBlack = (x, y) => {
      const i = idx(x, y);
      imgd.data[i] = imgd.data[i + 1] = imgd.data[i + 2] = 0;
      imgd.data[i + 3] = 255;
    };

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (black(copy, x, y)) {
          continue;
        }
        let neighbors = 0;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1]
        ]) {
          if (black(copy, x + dx, y + dy)) {
            neighbors += 1;
          }
        }
        if (neighbors >= 3) {
          setBlack(x, y);
        }
      }
    }
  };

  const colorMask = (imgd) => {
    for (let i = 0; i < imgd.data.length; i += 4) {
      const r = imgd.data[i] / 255;
      const g = imgd.data[i + 1] / 255;
      const b = imgd.data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) * 255;
      const sat = max === 0 ? 0 : (max - min) / max;
      const keep = sat > 0.22 || lum < 110;
      const out = keep ? 0 : 255;
      imgd.data[i] = out;
      imgd.data[i + 1] = out;
      imgd.data[i + 2] = out;
      imgd.data[i + 3] = 255;
    }
  };

  const segmentedThreshold = (() => {
    const scale = 4;
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = image.naturalWidth * scale;
    rawCanvas.height = image.naturalHeight * scale;
    const rawCtx = rawCanvas.getContext("2d");
    if (!rawCtx) {
      throw new Error("canvas 2d context unavailable");
    }
    rawCtx.imageSmoothingEnabled = false;
    rawCtx.drawImage(image, 0, 0, rawCanvas.width, rawCanvas.height);

    const canvas = document.createElement("canvas");
    canvas.width = rawCanvas.width;
    canvas.height = rawCanvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas 2d context unavailable");
    }
    ctx.drawImage(rawCanvas, 0, 0);
    const imgd = ctx.getImageData(0, 0, canvas.width, canvas.height);
    threshold(imgd);
    ctx.putImageData(imgd, 0, 0);

    const blackCounts = [];
    for (let x = 0; x < canvas.width; x++) {
      let count = 0;
      for (let y = 0; y < canvas.height; y++) {
        const index = (y * canvas.width + x) * 4;
        if (imgd.data[index] < 128) {
          count += 1;
        }
      }
      blackCounts.push(count);
    }

    const targetChars = 4;
    const minCharWidth = Math.floor(canvas.width / 8);
    const cutCount = targetChars - 1;
    const cuts = [];
    let start = 0;

    for (let cutIndex = 1; cutIndex <= cutCount; cutIndex++) {
      const ideal = Math.floor((canvas.width * cutIndex) / targetChars);
      const searchStart = Math.max(start + minCharWidth, ideal - Math.floor(canvas.width / 10));
      const searchEnd = Math.min(
        canvas.width - (cutCount - cutIndex + 1) * minCharWidth,
        ideal + Math.floor(canvas.width / 10)
      );

      let bestX = ideal;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let x = searchStart; x <= searchEnd; x++) {
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
    const makeSegment = (sourceCanvas, left, width) => {
      const segmentCanvas = document.createElement("canvas");
      segmentCanvas.width = width;
      segmentCanvas.height = canvas.height;
      const segmentCtx = segmentCanvas.getContext("2d");
      if (!segmentCtx) {
        throw new Error("segment canvas 2d context unavailable");
      }
      segmentCtx.drawImage(
        sourceCanvas,
        left,
        0,
        width,
        canvas.height,
        0,
        0,
        width,
        canvas.height
      );
      return segmentCanvas.toDataURL("image/png");
    };

    const segments = [];
    for (let i = 0; i < ranges.length - 1; i++) {
      const left = Math.max(0, ranges[i] - 2);
      const right = Math.min(canvas.width, ranges[i + 1] + 2);
      const width = Math.max(1, right - left);
      segments.push({
        threshold: makeSegment(canvas, left, width),
        raw: makeSegment(rawCanvas, left, width)
      });
    }

    return { name: "segmented-threshold", segments };
  })();

  return [
    make("color-mask", colorMask),
    make("threshold", threshold),
    make("remove-horizontal", removeHorizontal),
    make("remove-horizontal-dilate", removeHorizontalDilate),
    segmentedThreshold
  ];
}, dataUrl);

const outputs = [];
for (const variant of variants) {
  if ("segments" in variant) {
    for (const mode of ["threshold", "raw"]) {
      const chars = [];
      for (let index = 0; index < variant.segments.length; index++) {
        const bytes = Buffer.from(
          variant.segments[index][mode].replace(/^data:image\/png;base64,/, ""),
          "base64"
        );
        await writeFile(resolve(outDir, `${variant.name}-${mode}-${index}.png`), bytes);
        const worker = await Tesseract.createWorker("eng", 1, {
          langPath: resolve(".cache/tessdata"),
          cachePath: resolve(".cache/tessdata"),
          gzip: true
        });
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
          });
          const result = await worker.recognize(bytes);
          chars.push(((result.data.text ?? "").replace(/\s+/g, "") || "").slice(0, 1));
        } finally {
          await worker.terminate();
        }
      }
      outputs.push({
        name: `${variant.name}-${mode}`,
        text: chars.join("")
      });
    }
    continue;
  }

  const bytes = Buffer.from(variant.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  await writeFile(resolve(outDir, `${variant.name}.png`), bytes);
  const worker = await Tesseract.createWorker("eng", 1, {
    langPath: resolve(".cache/tessdata"),
    cachePath: resolve(".cache/tessdata"),
    gzip: true
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    });
    const result = await worker.recognize(bytes);
    outputs.push({
      name: variant.name,
      text: result.data.text,
      confidence: result.data.confidence
    });
  } finally {
    await worker.terminate();
  }
}

await browser.close();
console.log(JSON.stringify(outputs, null, 2));
