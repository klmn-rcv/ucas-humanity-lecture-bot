import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".cache/ms-playwright")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".cache/ms-playwright");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
