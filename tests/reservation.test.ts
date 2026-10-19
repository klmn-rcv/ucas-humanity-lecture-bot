import { describe, expect, it } from "vitest";
import { normalizeLectureRow, parseReservationWindow } from "../src/lecture-page.js";
import { getNextReservationCheck } from "../src/schedule.js";
import { decideLectures } from "../src/filter.js";
import { reservationOutcome } from "../src/register.js";

const row = (status = "查看详情 预约时间：2026-10-22 00:00~2026-10-30 17:30", actions = ["查看详情"]) => ({
  rowIndex: 2, idCandidate: "", detailHref: "/subject/7155/humanityView", actionTexts: actions,
  cells: ["明德讲堂历史系列", "M1179 科学欧洲的塑造", "2", "教三楼308", "2026-10-30 18:30-20:30", "全校学生", "", "明德讲堂", status]
});
const nextScan = new Date("2026-10-22T01:00:00+08:00");
const allDays = Array.from({length:7}, (_, weekday) => ({ weekday, ranges:[{startMinutes:0,endMinutes:1439}] }));

describe("reservation windows and queue", () => {
  it("recognizes the real JSON response and does not treat other rows' status as success", () => {
    expect(reservationOutcome('"countFail"', "讲座地点容纳人数已满，无法预约！")).toBe("full");
    expect(reservationOutcome('"conflict"', "与已选课程时间有冲突，无法报名！")).toBe("rejected");
    expect(reservationOutcome('"reserveTimeFail"', "目前未到预约时间，无法预约！")).toBe("unknown");
    expect(reservationOutcome('"success"', "报名成功！")).toBe("registered");
    expect(reservationOutcome("", "")).toBe("unknown");
  });
  it("parses the real website's reservation window in Beijing time", () => {
    expect(parseReservationWindow(row().cells[8])).toEqual({
      reservationOpensAt: "2026-10-21T16:00:00.000Z", reservationClosesAt: "2026-10-30T09:30:00.000Z"
    });
    expect(parseReservationWindow("报名").reservationOpensAt).toBeNull();
  });
  it("uses the actual title and an ID that survives button changes and reordered rows", () => {
    const future = normalizeLectureRow(row())!;
    const open = normalizeLectureRow({...row("报名", ["查看详情", "报名"]),rowIndex:4})!;
    expect(future.title).toBe("M1179 科学欧洲的塑造");
    expect(future.id).toBe(open.id);
    expect(future.actionAvailable).toBe(false);
    expect(open.actionAvailable).toBe(true);
    expect(normalizeLectureRow({...row(),cells:[] })).toBeNull();
    expect(normalizeLectureRow({...row(),cells:["讲座说明",...row().cells.slice(1)]})).toBeNull();
  });
  it("does not interpret cancel buttons as new reservations", () => {
    const booked = normalizeLectureRow(row("取消报名", ["取消报名"]))!;
    expect(booked.terminalState).toBe("booked");
    expect(booked.actionAvailable).toBe(false);
  });
  it("processes currently open items and blocks future/expired items", () => {
    const future = normalizeLectureRow(row("预约时间：2026-10-22 00:00~2026-10-30 17:30", ["报名"]))!;
    const open = {...normalizeLectureRow(row("报名", ["报名"]))!,id:"open"};
    const decisions = decideLectures([open,future],{terminalLectures:{}},new Set(),false,allDays,new Date("2026-10-21T23:59:00+08:00"));
    expect(decisions.map(d => d.reason)).toEqual(["candidate","reservation-not-open"]);
    const expired = decideLectures([future],{terminalLectures:{}},new Set(),false,allDays,new Date("2026-10-30T17:30:00+08:00"));
    expect(expired[0].reason).toBe("reservation-ended");
  });
  it("chooses the earliest opening among all pending lectures and prewarms one minute early", () => {
    const first = normalizeLectureRow(row())!;
    const later = {...first,id:"later",reservationOpensAt:"2026-10-22T00:10:00+08:00"};
    expect(getNextReservationCheck([later, first],new Date("2026-10-21T23:50:00+08:00"),nextScan).getTime())
      .toBe(Date.parse("2026-10-21T23:59:00+08:00"));
    expect(getNextReservationCheck([first],new Date("2026-10-21T23:59:30+08:00"),nextScan).getTime())
      .toBe(Date.parse("2026-10-22T00:00:00+08:00"));
  });
  it("polls an opened window every second even while the button has not appeared", () => {
    const lecture = normalizeLectureRow(row())!;
    const now=new Date("2026-10-22T00:00:00+08:00");
    expect(getNextReservationCheck([lecture],now,nextScan).getTime()).toBe(now.getTime()+1000);
    expect(getNextReservationCheck([{...lecture,terminalState:"full"}],now,nextScan)).toEqual(nextScan);
  });
});
