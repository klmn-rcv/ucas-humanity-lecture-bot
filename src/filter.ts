import type { BotState, DailyTimeWindows, LectureDecision, LectureRecord } from "./types.js";
import { isQuotaReached } from "./quota.js";
import { getStoredLectureState } from "./state-store.js";
import { explainTimeRule, isAllowedLectureTime, parseLectureStart } from "./time-window.js";

export function decideLectures(
  lectures: LectureRecord[],
  state: BotState,
  seenInRun: Set<string>,
  quotaReached: boolean,
  timeWindows: DailyTimeWindows[]
): LectureDecision[] {
  if (quotaReached) {
    return lectures.map((lecture) => ({
      lecture,
      action: "stop",
      reason: "quota-reached"
    }));
  }

  return lectures.map((lecture) => decideLecture(lecture, state, seenInRun, timeWindows));
}

function decideLecture(
  lecture: LectureRecord,
  state: BotState,
  seenInRun: Set<string>,
  timeWindows: DailyTimeWindows[]
): LectureDecision {
  const storedState = getStoredLectureState(state, lecture.id);
  if (storedState) {
    return {
      lecture,
      action: "skip",
      reason: "local-terminal-state"
    };
  }

  if (lecture.terminalState !== null) {
    return {
      lecture,
      action: "skip",
      reason: "page-terminal-state"
    };
  }

  const parsed = lecture.startTimeText ? parseLectureStart(lecture.startTimeText) : null;
  if (!parsed || !isAllowedLectureTime(parsed.date, timeWindows)) {
    return {
      lecture,
      action: "skip",
      reason: "time-window-mismatch"
    };
  }

  if (!lecture.actionAvailable) {
    return {
      lecture,
      action: "skip",
      reason: "no-action"
    };
  }

  if (seenInRun.has(lecture.id)) {
    return {
      lecture,
      action: "skip",
      reason: "duplicate-in-run"
    };
  }

  seenInRun.add(lecture.id);
  return {
    lecture,
    action: "candidate",
    reason: "candidate"
  };
}

export function summarizeDecisionReason(decision: LectureDecision): string {
  return summarizeDecisionReasonWithRules(decision, []);
}

export function summarizeDecisionReasonWithRules(
  decision: LectureDecision,
  timeWindows: DailyTimeWindows[]
): string {
  switch (decision.reason) {
    case "quota-reached":
      return "已达到预约次数要求，停止继续报名";
    case "local-terminal-state":
      return "本地状态已记录为已预约或人数已满";
    case "page-terminal-state":
      return "页面已显示该讲座处于已预约或人数已满状态";
    case "time-window-mismatch":
      if (!decision.lecture.startTimeText) {
        return "未识别出开始时间，默认跳过";
      }

      const parsed = parseLectureStart(decision.lecture.startTimeText);
      return parsed ? explainTimeRule(parsed.date, timeWindows) : "开始时间格式无法解析，默认跳过";
    case "no-action":
      return "页面上未发现可点击的报名入口";
    case "duplicate-in-run":
      return "本次运行中已处理过该讲座";
    case "candidate":
      return "符合时间窗口且存在可用报名入口";
  }
}

export { isQuotaReached };
