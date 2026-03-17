import { describe, expect, it } from "vitest";
import { markLectureTerminalState } from "../src/state-store.js";
import type { BotState, LectureRecord } from "../src/types.js";

describe("state store", () => {
  it("records terminal lecture states", () => {
    const state: BotState = {
      terminalLectures: {}
    };

    const lecture: LectureRecord = {
      id: "abc",
      title: "测试讲座",
      startTimeText: "2026-03-18 19:00",
      startTimeIso: "2026-03-18T11:00:00.000Z",
      location: "礼堂",
      statusText: "已预约",
      summaryText: "测试讲座 2026-03-18 19:00 礼堂 已预约",
      actionText: null,
      actionAvailable: false,
      terminalState: "booked",
      rowIndex: 1
    };

    markLectureTerminalState(state, lecture, "booked", "测试备注");
    expect(state.terminalLectures.abc.state).toBe("booked");
    expect(state.terminalLectures.abc.note).toBe("测试备注");
  });
});
