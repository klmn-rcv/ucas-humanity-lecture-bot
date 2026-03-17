import { describe, expect, it } from "vitest";
import { isManualVerificationSurface } from "../src/login.js";

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
});
