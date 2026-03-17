import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BotState,
  LectureRecord,
  StoredLectureState,
  TerminalLectureState
} from "./types.js";
import { nowIso } from "./util.js";

export async function loadState(path: string): Promise<BotState> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<BotState>;
    return {
      terminalLectures: parsed.terminalLectures ?? {},
      lastQuota: parsed.lastQuota,
      updatedAt: parsed.updatedAt
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        terminalLectures: {}
      };
    }

    throw error;
  }
}

export async function saveState(path: string, state: BotState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        ...state,
        updatedAt: nowIso()
      },
      null,
      2
    )
  );
}

export function getStoredLectureState(state: BotState, lectureId: string): StoredLectureState | null {
  return state.terminalLectures[lectureId] ?? null;
}

export function markLectureTerminalState(
  state: BotState,
  lecture: LectureRecord,
  terminalState: TerminalLectureState,
  note?: string
): void {
  const existing = state.terminalLectures[lecture.id];
  const timestamp = nowIso();

  state.terminalLectures[lecture.id] = {
    lectureId: lecture.id,
    title: lecture.title,
    state: terminalState,
    note,
    firstSeenAt: existing?.firstSeenAt ?? timestamp,
    lastSeenAt: timestamp
  };
}
