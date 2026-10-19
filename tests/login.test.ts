import { describe, expect, it } from "vitest";
import { extractPortalHref, isManualVerificationSurface, isSepPortalUrl, selectLecturePortalHref } from "../src/login.js";

describe("manual verification detection", () => {
  it("treats userVisit as a verification page", () => {
    expect(
      isManualVerificationSurface(
        "https://sep.ucas.ac.cn/user/userVisit",
        "SEP 教育业务接入平台 邮箱验证"
      )
    ).toBe(true);
  });

  it("does not treat appStore as a verification page", () => {
    expect(
      isManualVerificationSurface(
        "https://sep.ucas.ac.cn/appStoreStudent",
        "SEP 教育业务接入平台 安全验证 个人信息"
      )
    ).toBe(false);
  });

  it("does not mistake the new workbench security labels for an email challenge", () => {
    expect(isManualVerificationSurface("https://sep.ucas.ac.cn/sepCard/card", "个人工作台 安全验证")).toBe(false);
  });
});

describe("SEP portal navigation", () => {
  it("recognizes both portal generations without matching return URL parameters", () => {
    expect(isSepPortalUrl("https://sep.ucas.ac.cn/appStoreStudent")).toBe(true);
    expect(isSepPortalUrl("https://sep.ucas.ac.cn/sepCard/card")).toBe(true);
    expect(isSepPortalUrl("https://sep.ucas.ac.cn/user/userVisit?return=/appStore")).toBe(false);
  });

  it("uses the new workbench course SSO card ahead of an old direct system link", () => {
    expect(selectLecturePortalHref([
      { text: "旧选课链接", href: "https://xkcts.ucas.ac.cn:8443/" },
      { text: "\n  选课系统  \n", href: "/portal/site/524/2412" }
    ])).toBe("/portal/site/524/2412");
  });

  it("retains the legacy humanities SSO entry and skips menu placeholders", () => {
    expect(selectLecturePortalHref([
      { text: "人文讲座报名", href: "#" },
      { text: "人文讲座报名", href: "/portal/site/226/xs/1/1/example" },
      { text: "选课系统", href: "/portal/site/524/2412" }
    ])).toBe("/portal/site/226/xs/1/1/example");
    expect(selectLecturePortalHref([{ text: "人文讲座报名", href: "javascript:void(0)" }])).toBeNull();
  });

  it("reads new card button URLs without executing their JavaScript", () => {
    expect(extractPortalHref({ onclick: "window.open('/portal/site/226/xs/1/1/route','_blank')" }))
      .toBe("/portal/site/226/xs/1/1/route");
    expect(extractPortalHref({ href: "#", dataUrl: "/portal/site/524/2412" }))
      .toBe("/portal/site/524/2412");
    expect(extractPortalHref({ onclick: "window.open(getTargetUrl())" })).toBeNull();
    expect(extractPortalHref({ href: "javascript:alert(1)" })).toBeNull();
  });

  it("selects more lectures in the humanities card rather than science lectures or records", () => {
    expect(selectLecturePortalHref([
      { text: "更多讲座", cardName: "科学前沿讲座", href: "/portal/site/226/science" },
      { text: "参加讲座10", cardName: "人文讲座", href: "/portal/site/226/records" },
      { text: "更多讲座", cardName: "人文讲座", href: "/portal/site/226/humanities" }
    ])).toBe("/portal/site/226/humanities");
  });
});
