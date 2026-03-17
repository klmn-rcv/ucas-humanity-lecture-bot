export type LogLevel = "debug" | "info" | "warn" | "error";

export type TerminalLectureState = "booked" | "full";

export interface CaptchaConfig {
  enabled: boolean;
  language: string;
  maxAttempts: number;
}

export interface AppConfig {
  username: string;
  password: string;
  loginUrl: string;
  humanityLectureUrl: string;
  statePath: string;
  headless: boolean;
  dryRun: boolean;
  pollIntervalMs: number;
  maxCycles: number;
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
  outcome: "registered" | "already-booked" | "full" | "unknown";
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
