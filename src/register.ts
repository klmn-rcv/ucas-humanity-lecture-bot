import type { Page } from "playwright";
import type { LectureRecord, RegistrationAttemptResult } from "./types.js";
import { extractLectureSnapshot, goToLecturePage } from "./lecture-page.js";
import { Logger } from "./log.js";

export function reservationOutcome(body: string, message: string): RegistrationAttemptResult["outcome"] {
  let code = body.trim();
  try {
    const decoded: unknown = JSON.parse(code);
    if (typeof decoded === "string") code = decoded;
  } catch { /* The legacy endpoint returns plain text. */ }
  if (code === "success") return "registered";
  if (code === "exits") return "already-booked";
  if (["countFail", "maxcount"].includes(code) || /人数已满|名额已满|已超过人数限制/.test(message)) return "full";
  if (["conflict", "fail", "centerFail", "existLecture"].includes(code)) return "rejected";
  if (code === "reserveTimeFail" || /无法|不可以|未到/.test(message)) return "unknown";
  if (/报名成功|预约成功/.test(message)) return "registered";
  if (/已经报名|已预约/.test(message)) return "already-booked";
  return "unknown";
}

export async function registerLecture(
  page: Page, lecture: LectureRecord, logger: Logger
): Promise<RegistrationAttemptResult> {
  await goToLecturePage(page, lecture.pageNumber ?? 1);
  const current = (await extractLectureSnapshot(page)).lectures.find(item => item.id === lecture.id);
  const result = (outcome: RegistrationAttemptResult["outcome"], detail: string): RegistrationAttemptResult => ({
    lectureId: lecture.id, title: lecture.title, outcome, detail
  });
  if (current?.terminalState === "booked") return result("already-booked", "页面已显示报名成功");
  if (current?.terminalState === "full") return result("full", "页面已显示人数已满");
  if (!current?.actionAvailable) return result("unknown", "刷新后未找到可点击的报名入口");

  let dialogMessage = "";
  const onDialog = async (dialog: import("playwright").Dialog): Promise<void> => {
    dialogMessage = dialog.message();
    logger.info("register.dialog", { message: dialogMessage });
    await dialog.accept();
  };
  page.on("dialog", onDialog);
  const response = page.waitForResponse(
    item => new URL(item.url()).pathname === "/subject/toSign" && item.request().method() === "POST",
    { timeout: 10000 }
  ).then(item => item.text()).catch(() => "");
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => null);
  try {
    const clicked = await page.evaluate(rowIndex => {
      const row = document.querySelectorAll("table tr, .table tr, tbody tr, .datagrid-row")[rowIndex];
      const target = Array.from(row?.querySelectorAll("a,button,input[type=button],input[type=submit]") ?? [])
        .find(element => !element.hasAttribute("disabled") &&
          /^(?:立即)?(?:预约|报名|选课)$/.test((element.textContent || (element as HTMLInputElement).value || "").replace(/\s+/g, "")));
      if (!target) return false;
      (target as HTMLElement).click();
      return true;
    }, current.rowIndex);
    if (!clicked) return result("unknown", "未找到报名按钮");
    const code = await response;
    await navigation;
    return result(reservationOutcome(code, dialogMessage), dialogMessage || code || "未识别到明确预约结果");
  } finally {
    page.off("dialog", onDialog);
  }
}
