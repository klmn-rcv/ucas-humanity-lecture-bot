import type { Page } from "playwright";
import type { LectureRecord, RegistrationAttemptResult } from "./types.js";
import { Logger } from "./log.js";
import { normalizeWhitespace } from "./util.js";

const rowSelector = "table tr, .table tr, tbody tr, .datagrid-row";

export async function registerLecture(
  page: Page,
  lecture: LectureRecord,
  logger: Logger
): Promise<RegistrationAttemptResult> {
  let dialogMessage: string | null = null;
  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 2000 })
    .then(async (dialog) => {
      dialogMessage = dialog.message();
      logger.info("register.dialog", { message: dialogMessage });
      await dialog.accept();
    })
    .catch(() => undefined);

  const clicked = await page.evaluate(
    ({ selector, rowIndex }) => {
      const rows = Array.from(document.querySelectorAll(selector));
      const row = rows[rowIndex];
      if (!row) {
        return false;
      }

      const candidates = Array.from(
        row.querySelectorAll("a, button, input[type='button'], input[type='submit']")
      );
      const target = candidates.find((element) => {
        const text = (element.textContent ?? (element as HTMLInputElement).value ?? "").trim();
        return /预约|报名|选课/.test(text);
      });

      if (!target) {
        return false;
      }

      (target as HTMLElement).click();
      return true;
    },
    {
      selector: rowSelector,
      rowIndex: lecture.rowIndex
    }
  );

  if (!clicked) {
    return {
      lectureId: lecture.id,
      title: lecture.title,
      outcome: "unknown",
      detail: "未在对应行找到可点击的报名元素"
    };
  }

  await dialogPromise;
  await page.waitForTimeout(1500);
  await clickPossibleConfirmButtons(page, logger);
  await page.waitForTimeout(1500);

  if (dialogMessage) {
    if (/已超过人数限制|人数已满|预约已满|名额已满|满额/.test(dialogMessage)) {
      return {
        lectureId: lecture.id,
        title: lecture.title,
        outcome: "full",
        detail: dialogMessage
      };
    }

    if (/成功|已预约|已报名|已经预约过/.test(dialogMessage)) {
      return {
        lectureId: lecture.id,
        title: lecture.title,
        outcome: "registered",
        detail: dialogMessage
      };
    }
  }

  const text = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  if (/成功|已预约|已报名/.test(text)) {
    return {
      lectureId: lecture.id,
      title: lecture.title,
      outcome: "registered",
      detail: "页面反馈显示报名成功或已预约"
    };
  }

  if (/人数已满|预约已满|名额已满|满额/.test(text)) {
    return {
      lectureId: lecture.id,
      title: lecture.title,
      outcome: "full",
      detail: "页面反馈显示人数已满"
    };
  }

  return {
    lectureId: lecture.id,
    title: lecture.title,
    outcome: "unknown",
    detail: dialogMessage ?? "点击后未识别出明确结果，需要人工检查日志和页面快照"
  };
}

async function clickPossibleConfirmButtons(page: Page, logger: Logger): Promise<void> {
  const candidates = [
    "button:has-text('确定')",
    "button:has-text('确认')",
    "button:has-text('是')",
    "a:has-text('确定')",
    "a:has-text('确认')"
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      logger.info("register.confirm-clicked", { selector });
      await locator.click().catch(() => undefined);
      await page.waitForTimeout(1000);
      return;
    }
  }
}
