import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config loader", () => {
  it("reads command line overrides", () => {
    vi.stubEnv("UCAS_USERNAME", "user");
    vi.stubEnv("UCAS_PASSWORD", "pass");
    const config = loadConfig(["--dry-run", "--state-path", "tmp/state.json", "--max-cycles", "3"]);
    expect(config.dryRun).toBe(true);
    expect(config.maxCycles).toBe(3);
    expect(config.statePath.endsWith("tmp/state.json")).toBe(true);
  });
});
