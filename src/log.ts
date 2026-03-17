import type { LogLevel } from "./types.js";
import { formatLocalTimestamp } from "./util.js";

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class Logger {
  constructor(private readonly minimumLevel: LogLevel) {}

  debug(event: string, data?: Record<string, unknown>): void {
    this.write("debug", event, data);
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.write("info", event, data);
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.write("warn", event, data);
  }

  error(event: string, data?: Record<string, unknown>): void {
    this.write("error", event, data);
  }

  private write(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
    if (levelRank[level] < levelRank[this.minimumLevel]) {
      return;
    }

    console.log(
      JSON.stringify({
        ts: formatLocalTimestamp(),
        level,
        event,
        ...data
      })
    );
  }
}
