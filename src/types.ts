export type LogLevel = "debug" | "info" | "warn" | "error";
export type RunMode = "single" | "scheduled";

export type TerminalLectureState = "booked" | "full";

export interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

export interface CaptchaConfig {
  enabled: boolean;
  maxAttempts: number;
  pythonExecutable: string;
}

export interface ScheduledRuntimeConfig {
  intervalMinutes: number;
  runImmediatelyOnStart: boolean;
  periods: TimeRange[];
}

export interface DailyTimeWindows {
  weekday: number;
  ranges: TimeRange[];
}

export interface AppConfig {
  configPath: string;
  configFileExists: boolean;
  username: string;
  password: string;
  loginUrl: string;
  humanityLectureUrl: string;
  statePath: string;
  headless: boolean;
  dryRun: boolean;
  runMode: RunMode;
  schedule: ScheduledRuntimeConfig;
  timeWindows: DailyTimeWindows[];
  logLevel: LogLevel;
  captcha: CaptchaConfig;
}

export interface ReservationQuota {
  bookedCount: number | null;
  requiredCount: number | null;
  rawText: string | null;
}

export interface LectureRecord {
  id: string;
  title: string;
  startTimeText: string | null;
  startTimeIso: string | null;
  location: string | null;
  statusText: string;
  summaryText: string;
  actionText: string | null;
  actionAvailable: boolean;
  terminalState: TerminalLectureState | null;
  rowIndex: number;
  pageNumber?: number;
  reservationOpensAt?: string | null;
  reservationClosesAt?: string | null;
}

export interface LecturePageSnapshot {
  lectures: LectureRecord[];
  quota: ReservationQuota;
  pageText: string;
}

export interface StoredLectureState {
  lectureId: string;
  title: string;
  state: TerminalLectureState;
  firstSeenAt: string;
  lastSeenAt: string;
  note?: string;
}

export interface BotState {
  terminalLectures: Record<string, StoredLectureState>;
  lastQuota?: ReservationQuota;
  updatedAt?: string;
}

export interface LectureDecision {
  lecture: LectureRecord;
  action: "skip" | "candidate" | "stop";
  reason:
    | "quota-reached"
    | "time-window-mismatch"
    | "local-terminal-state"
    | "page-terminal-state"
    | "no-action"
    | "reservation-not-open"
    | "reservation-ended"
    | "duplicate-in-run"
    | "candidate";
}

export interface CaptchaSolveResult {
  encountered: boolean;
  solvedText: string | null;
  attemptsUsed: number;
}

export interface RegistrationAttemptResult {
  lectureId: string;
  title: string;
  outcome: "registered" | "already-booked" | "full" | "rejected" | "unknown";
  detail: string;
}

export interface RunSummary {
  cycleCount: number;
  dryRun: boolean;
  quota: ReservationQuota;
  candidates: LectureRecord[];
  skipped: LectureDecision[];
  attempts: RegistrationAttemptResult[];
  stopReason: string | null;
}
