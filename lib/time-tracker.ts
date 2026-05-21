"use client";

import { create } from "zustand";

// Per-device, localStorage-backed time tracker store. Kept deliberately
// separate from the main AppState because (a) it's per-device by design
// (study time doesn't belong on every machine you sign into) and (b) it
// updates every second while a pomodoro runs, which would otherwise
// blast /api/state with one write per minute even though nothing about
// the canvas changed.

const STORAGE_KEY = "studygit-time-tracker-v1";

export const DEFAULT_WORK = 25 * 60;
export const DEFAULT_SHORT = 5 * 60;
export const DEFAULT_LONG = 15 * 60;
export const DEFAULT_CYCLES = 4;

// Minimum tracked seconds in a day for it to "count" toward the streak.
// Five minutes is low enough that a single distracted day still counts
// if you opened a PDF and skimmed it.
export const STREAK_THRESHOLD_SECONDS = 5 * 60;

export type PomodoroMode = "work" | "short-break" | "long-break";
export type PomodoroRunState = "idle" | "running" | "paused";

export type TrackerSettings = {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  cyclesUntilLongBreak: number;
  soundEnabled: boolean;
};

const DEFAULT_SETTINGS: TrackerSettings = {
  workDuration: DEFAULT_WORK,
  shortBreakDuration: DEFAULT_SHORT,
  longBreakDuration: DEFAULT_LONG,
  cyclesUntilLongBreak: DEFAULT_CYCLES,
  soundEnabled: true,
};

// Local-time YYYY-MM-DD key, so a "study day" matches what the wall clock
// says rather than UTC midnight.
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function lastNDays(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}

// Returns the 7 day keys (Mon → Sun) of the calendar week relative to
// today. `offset` is in weeks: 0 = this week, -1 = last week, +1 =
// next week (used by the prev/next nav in the tracker chart). We pin
// the week start to Monday rather than Sunday because most "study
// week" mental models bucket weekends together.
export function weekDaysFromOffset(
  offset: number,
  from: Date = new Date()
): { keys: string[]; start: Date; end: Date } {
  const start = new Date(from);
  // JS getDay(): Sun=0…Sat=6. Map to Mon=0…Sun=6 with the +6%7 trick.
  const monIndex = (from.getDay() + 6) % 7;
  start.setDate(from.getDate() - monIndex + offset * 7);
  start.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    keys.push(todayKey(d));
  }
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { keys, start, end };
}

// Compact: "2h 13m" / "47m" / "12s"; non-compact: "h:mm:ss" or "mm:ss".
export function formatDuration(
  totalSeconds: number,
  opts: { compact?: boolean } = {}
): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (opts.compact) {
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${sec}s`;
  }
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

// Streak in days: consecutive recent days at/above STREAK_THRESHOLD. If
// today hasn't crossed the threshold yet we keep counting from yesterday
// — otherwise the streak would visually "break" every morning until the
// user studied enough that day to re-qualify.
export function computeStreak(daily: Record<string, number>): number {
  let streak = 0;
  let checkedToday = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const sec = daily[todayKey(d)] ?? 0;
    if (sec >= STREAK_THRESHOLD_SECONDS) {
      streak++;
      checkedToday = true;
      continue;
    }
    if (i === 0 && !checkedToday) {
      // Today hasn't qualified yet — don't break the streak, keep going.
      checkedToday = true;
      continue;
    }
    break;
  }
  return streak;
}

type Persisted = {
  dailyActiveSeconds: Record<string, number>;
  dailyPomodoros: Record<string, number>;
  settings: TrackerSettings;
  pomodoroRunState: PomodoroRunState;
  pomodoroMode: PomodoroMode;
  pomodoroRemaining: number;
  pomodoroCycle: number;
};

const INITIAL: Persisted = {
  dailyActiveSeconds: {},
  dailyPomodoros: {},
  settings: DEFAULT_SETTINGS,
  pomodoroRunState: "idle",
  pomodoroMode: "work",
  pomodoroRemaining: DEFAULT_WORK,
  pomodoroCycle: 0,
};

function loadFromStorage(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      dailyActiveSeconds: parsed.dailyActiveSeconds ?? {},
      dailyPomodoros: parsed.dailyPomodoros ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      // Resume the timer in "paused" rather than auto-running so the user
      // is never surprised by a phantom session that started while the
      // tab was closed.
      pomodoroRunState:
        parsed.pomodoroRunState === "running"
          ? "paused"
          : parsed.pomodoroRunState ?? "idle",
      pomodoroMode: parsed.pomodoroMode ?? "work",
      pomodoroRemaining: parsed.pomodoroRemaining ?? DEFAULT_WORK,
      pomodoroCycle: parsed.pomodoroCycle ?? 0,
    };
  } catch {
    return null;
  }
}

function saveToStorage(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Quota / private-browsing — silently drop, the tracker keeps
    // working from in-memory state for the rest of the session.
  }
}

export function pomodoroDuration(
  mode: PomodoroMode,
  settings: TrackerSettings
): number {
  switch (mode) {
    case "work":
      return settings.workDuration;
    case "short-break":
      return settings.shortBreakDuration;
    case "long-break":
      return settings.longBreakDuration;
  }
}

function nextMode(
  current: PomodoroMode,
  cycle: number,
  cyclesUntilLong: number
): { mode: PomodoroMode; cycle: number } {
  if (current === "work") {
    const newCycle = cycle + 1;
    if (newCycle >= cyclesUntilLong) {
      return { mode: "long-break", cycle: newCycle };
    }
    return { mode: "short-break", cycle: newCycle };
  }
  return {
    mode: "work",
    cycle: current === "long-break" ? 0 : cycle,
  };
}

type Store = Persisted & {
  hydrated: boolean;
  hydrate: () => void;
  flush: () => void;
  tickActive: (seconds: number) => void;
  // Returns the mode that just finished, or null if the timer is still
  // counting down — lets the UI react (sound, notification) without
  // bolting effects onto the store.
  tickPomodoro: (seconds: number) => { completedMode: PomodoroMode } | null;
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resumePomodoro: () => void;
  skipPomodoro: () => void;
  resetPomodoro: () => void;
  setSettings: (s: Partial<TrackerSettings>) => void;
};

export const useTimeTracker = create<Store>((set, get) => ({
  ...INITIAL,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadFromStorage();
    if (stored) {
      set({ ...stored, hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },

  flush: () => {
    const s = get();
    saveToStorage({
      dailyActiveSeconds: s.dailyActiveSeconds,
      dailyPomodoros: s.dailyPomodoros,
      settings: s.settings,
      pomodoroRunState: s.pomodoroRunState,
      pomodoroMode: s.pomodoroMode,
      pomodoroRemaining: s.pomodoroRemaining,
      pomodoroCycle: s.pomodoroCycle,
    });
  },

  tickActive: (seconds) => {
    set((s) => {
      const key = todayKey();
      return {
        dailyActiveSeconds: {
          ...s.dailyActiveSeconds,
          [key]: (s.dailyActiveSeconds[key] ?? 0) + seconds,
        },
      };
    });
  },

  tickPomodoro: (seconds) => {
    let completed: { completedMode: PomodoroMode } | null = null;
    set((s) => {
      if (s.pomodoroRunState !== "running") return s;
      const remaining = s.pomodoroRemaining - seconds;
      if (remaining > 0) {
        return { pomodoroRemaining: remaining };
      }
      completed = { completedMode: s.pomodoroMode };
      const dailyPomodoros = { ...s.dailyPomodoros };
      if (s.pomodoroMode === "work") {
        const key = todayKey();
        dailyPomodoros[key] = (dailyPomodoros[key] ?? 0) + 1;
      }
      const { mode, cycle } = nextMode(
        s.pomodoroMode,
        s.pomodoroCycle,
        s.settings.cyclesUntilLongBreak
      );
      return {
        pomodoroMode: mode,
        pomodoroCycle: cycle,
        pomodoroRemaining: pomodoroDuration(mode, s.settings),
        // Auto-pause when transitioning so the user actively chooses to
        // start the next phase (mirrors how most Pomodoro apps behave).
        pomodoroRunState: "paused",
        dailyPomodoros,
      };
    });
    return completed;
  },

  startPomodoro: () => {
    set((s) => {
      if (s.pomodoroRunState === "running") return s;
      const remaining =
        s.pomodoroRemaining > 0
          ? s.pomodoroRemaining
          : pomodoroDuration(s.pomodoroMode, s.settings);
      return { pomodoroRunState: "running", pomodoroRemaining: remaining };
    });
  },

  pausePomodoro: () => {
    set((s) =>
      s.pomodoroRunState === "running" ? { pomodoroRunState: "paused" } : s
    );
  },

  resumePomodoro: () => {
    set((s) =>
      s.pomodoroRunState === "paused" ? { pomodoroRunState: "running" } : s
    );
  },

  skipPomodoro: () => {
    set((s) => {
      const dailyPomodoros = { ...s.dailyPomodoros };
      if (s.pomodoroMode === "work") {
        const key = todayKey();
        dailyPomodoros[key] = (dailyPomodoros[key] ?? 0) + 1;
      }
      const { mode, cycle } = nextMode(
        s.pomodoroMode,
        s.pomodoroCycle,
        s.settings.cyclesUntilLongBreak
      );
      return {
        pomodoroMode: mode,
        pomodoroCycle: cycle,
        pomodoroRemaining: pomodoroDuration(mode, s.settings),
        pomodoroRunState: "paused",
        dailyPomodoros,
      };
    });
  },

  resetPomodoro: () => {
    set((s) => ({
      pomodoroMode: "work",
      pomodoroCycle: 0,
      pomodoroRemaining: s.settings.workDuration,
      pomodoroRunState: "idle",
    }));
  },

  setSettings: (patch) => {
    set((s) => {
      const settings: TrackerSettings = { ...s.settings, ...patch };
      // If we're sitting idle on the work mode, re-sync the visible
      // countdown to the new work duration so the change is immediately
      // reflected in the ring + timer readout.
      const remaining =
        s.pomodoroRunState === "idle" && s.pomodoroMode === "work"
          ? settings.workDuration
          : s.pomodoroRemaining;
      return { settings, pomodoroRemaining: remaining };
    });
  },
}));
