"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Pause,
  Play,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  computeStreak,
  formatDuration,
  pomodoroDuration,
  todayKey,
  useTimeTracker,
  weekDaysFromOffset,
  type PomodoroMode,
} from "@/lib/time-tracker";

// Single-letter weekday labels so 7 days fit comfortably even on the
// narrow 320 px popover without elbowing the bar chart.
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Curated focus-duration chips. Selecting one swaps the work duration
// in the store; the store re-syncs `pomodoroRemaining` automatically
// when we're idle on the work phase.
const DURATION_CHIPS = [15, 25, 45, 60];

function modeLabel(mode: PomodoroMode): string {
  return mode === "work" ? "focus" : "break";
}

// Human label for the currently-viewed calendar week. Recent weeks get
// relative words ("This week", "Last week", "2 weeks ago"); anything
// further back falls back to a "Mon D – Mon D" date range so users
// scrolling deep into history still know exactly which week they're
// looking at.
function weekRangeLabel(offset: number, start: Date, end: Date): string {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  if (offset > -5 && offset < 0) return `${-offset} weeks ago`;
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  if (start.getMonth() === end.getMonth()) {
    return `${fmt.format(start)} – ${end.getDate()}`;
  }
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

// Two-note "ding" using the Web Audio API — no asset to ship, degrades
// silently on platforms that block audio without a user gesture (we
// only play it for sessions the user explicitly started).
function playDing(): void {
  if (typeof window === "undefined") return;
  type Ctor = typeof window.AudioContext;
  const AudioCtx =
    (window.AudioContext as Ctor | undefined) ??
    ((window as unknown as { webkitAudioContext?: Ctor })
      .webkitAudioContext as Ctor | undefined);
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [880, 1318];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.start(start);
      osc.stop(start + 0.6);
    }
    window.setTimeout(() => void ctx.close().catch(() => {}), 1500);
  } catch {
    // noop
  }
}

export function TimeTracker() {
  const hydrated = useTimeTracker((s) => s.hydrated);
  const hydrate = useTimeTracker((s) => s.hydrate);
  const flush = useTimeTracker((s) => s.flush);

  const tickActive = useTimeTracker((s) => s.tickActive);
  const tickPomodoro = useTimeTracker((s) => s.tickPomodoro);
  const startPomodoro = useTimeTracker((s) => s.startPomodoro);
  const pausePomodoro = useTimeTracker((s) => s.pausePomodoro);
  const resumePomodoro = useTimeTracker((s) => s.resumePomodoro);
  const skipPomodoro = useTimeTracker((s) => s.skipPomodoro);
  const resetPomodoro = useTimeTracker((s) => s.resetPomodoro);
  const setSettings = useTimeTracker((s) => s.setSettings);

  const pomodoroRunState = useTimeTracker((s) => s.pomodoroRunState);
  const pomodoroMode = useTimeTracker((s) => s.pomodoroMode);
  const pomodoroRemaining = useTimeTracker((s) => s.pomodoroRemaining);
  const settings = useTimeTracker((s) => s.settings);
  const dailyActive = useTimeTracker((s) => s.dailyActiveSeconds);
  const dailyPomos = useTimeTracker((s) => s.dailyPomodoros);

  const [open, setOpen] = useState(false);
  // 0 = current calendar week (Mon–Sun), negative = N weeks back. We
  // keep this purely client-side because the chart data lives in the
  // same store; nothing about it needs to be persisted.
  const [weekOffset, setWeekOffset] = useState(0);

  // Refs let the 1Hz interval read latest callbacks without being torn
  // down + recreated on every render (a recreation per re-render would
  // skew sub-second slices when something unrelated re-renders us).
  const tickActiveRef = useRef(tickActive);
  const tickPomodoroRef = useRef(tickPomodoro);
  const flushRef = useRef(flush);
  const soundEnabledRef = useRef(settings.soundEnabled);
  useEffect(() => {
    tickActiveRef.current = tickActive;
    tickPomodoroRef.current = tickPomodoro;
    flushRef.current = flush;
    soundEnabledRef.current = settings.soundEnabled;
  }, [tickActive, tickPomodoro, flush, settings.soundEnabled]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 1Hz tick: active time only counts when the tab is visible AND
  // focused (so background tabs / other windows can't inflate study
  // time); the pomodoro keeps counting either way because the user
  // explicitly committed to that session.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined") {
        const focused =
          document.visibilityState === "visible" && document.hasFocus();
        if (focused) tickActiveRef.current(1);
      }
      const completed = tickPomodoroRef.current(1);
      if (completed && soundEnabledRef.current) playDing();
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  // Throttled persistence + flush on tab-hide / unload.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => flushRef.current(), 15_000);
    const onHide = () => flushRef.current();
    const onVis = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hydrated]);

  const todayTotal = dailyActive[todayKey()] ?? 0;
  const todayPomos = dailyPomos[todayKey()] ?? 0;
  const streak = useMemo(() => computeStreak(dailyActive), [dailyActive]);

  const isRunning = pomodoroRunState === "running";
  const isPaused = pomodoroRunState === "paused";
  const isActive = isRunning || isPaused;

  // Tab title reflects the live timer so you can glance at the tab
  // strip when you've alt-tabbed away. Reset on unmount.
  useEffect(() => {
    const base = "Studygit";
    if (typeof document === "undefined") return;
    if (isRunning) {
      document.title = `${formatDuration(pomodoroRemaining)} — ${base}`;
    } else {
      document.title = base;
    }
    return () => {
      document.title = base;
    };
  }, [isRunning, pomodoroRemaining]);

  const buttonLabel = useMemo(() => {
    if (isActive) return formatDuration(pomodoroRemaining);
    return formatDuration(todayTotal, { compact: true });
  }, [isActive, pomodoroRemaining, todayTotal]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { weekData, weekStart, weekEnd, todayK } = useMemo(() => {
    const { keys, start, end } = weekDaysFromOffset(weekOffset);
    const data = keys.map((key) => {
      // Local-time parse so we match todayKey()'s timezone choice.
      const date = new Date(`${key}T00:00:00`);
      return {
        key,
        date,
        dayLabel: DAY_LABELS[date.getDay()],
        seconds: dailyActive[key] ?? 0,
      };
    });
    return {
      weekData: data,
      weekStart: start,
      weekEnd: end,
      todayK: todayKey(),
    };
  }, [dailyActive, weekOffset]);
  const maxSeconds = Math.max(60, ...weekData.map((d) => d.seconds));
  const weekTotal = weekData.reduce((sum, d) => sum + d.seconds, 0);
  const weekLabel = weekRangeLabel(weekOffset, weekStart, weekEnd);
  const canGoForward = weekOffset < 0;

  const fullDuration = pomodoroDuration(pomodoroMode, settings);
  const progress = isActive
    ? Math.max(0, Math.min(1, 1 - pomodoroRemaining / fullDuration))
    : 0;
  const activeChipMinutes = Math.round(settings.workDuration / 60);

  const handlePrimary = () => {
    if (isRunning) pausePomodoro();
    else if (isPaused) resumePomodoro();
    else startPomodoro();
  };
  const primaryLabel = isRunning ? "Pause" : isPaused ? "Resume" : "Start";
  const PrimaryIcon = isRunning ? Pause : Play;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-[color-mix(in_srgb,var(--pg-accent)_12%,transparent)] text-[var(--pg-accent)] hover:bg-[color-mix(in_srgb,var(--pg-accent)_20%,transparent)]"
            : "text-[var(--pg-muted)] hover:bg-[var(--pg-bg-elevated)] hover:text-[var(--pg-fg)]"
        )}
        title={
          isActive
            ? `${modeLabel(pomodoroMode)} · ${formatDuration(pomodoroRemaining)}`
            : `${formatDuration(todayTotal, { compact: true })} today · click for tracker`
        }
        aria-label="Time tracker"
      >
        {!isActive ? <Timer size={12} /> : null}
        <span className="font-medium tracking-tight tabular-nums">
          {buttonLabel}
        </span>
        {isRunning ? <span className="pg-tracker-dot" aria-hidden /> : null}
      </button>

      {open ? (
        <div
          className="pg-tracker-pop"
          role="dialog"
          aria-label="Time tracker"
        >
          <div
            className="pg-tracker-pop-progress"
            aria-hidden
            style={{ transform: `scaleX(${progress})` }}
          />

          <div className="pg-tracker-pop-head">
            <span className="pg-tracker-pop-eyebrow">time tracker</span>
            <button
              type="button"
              onClick={() =>
                setSettings({ soundEnabled: !settings.soundEnabled })
              }
              className="pg-tracker-pop-icon"
              title={settings.soundEnabled ? "Mute alerts" : "Unmute alerts"}
              aria-label={
                settings.soundEnabled ? "Mute alerts" : "Unmute alerts"
              }
            >
              {settings.soundEnabled ? (
                <Volume2 size={12} />
              ) : (
                <VolumeX size={12} />
              )}
            </button>
          </div>

          <div className="pg-tracker-pop-hero">
            <div
              className={clsx(
                "pg-tracker-pop-time tabular-nums",
                isPaused && "is-paused"
              )}
            >
              {formatDuration(pomodoroRemaining)}
            </div>
            <div
              className={clsx(
                "pg-tracker-pop-mode",
                isActive && "is-active",
                isPaused && "is-paused"
              )}
            >
              {modeLabel(pomodoroMode)}
              {isPaused ? " · paused" : ""}
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrimary}
            className={clsx(
              "pg-tracker-pop-cta",
              isRunning && "is-running"
            )}
          >
            <PrimaryIcon size={13} strokeWidth={2.4} />
            <span>{primaryLabel}</span>
          </button>

          <div className="pg-tracker-pop-sub">
            {isActive ? (
              <div className="pg-tracker-pop-links">
                <button
                  type="button"
                  className="pg-tracker-pop-link"
                  onClick={skipPomodoro}
                  title="Skip to next phase"
                >
                  skip
                </button>
                <span aria-hidden className="pg-tracker-pop-dot-sep">
                  ·
                </span>
                <button
                  type="button"
                  className="pg-tracker-pop-link"
                  onClick={resetPomodoro}
                  title="Reset session"
                >
                  reset
                </button>
              </div>
            ) : (
              <div
                className="pg-tracker-pop-chips"
                role="radiogroup"
                aria-label="Focus duration"
              >
                {DURATION_CHIPS.map((minutes, i) => {
                  const selected = minutes === activeChipMinutes;
                  return (
                    <span key={minutes} className="contents">
                      {i > 0 ? (
                        <span
                          aria-hidden
                          className="pg-tracker-pop-chip-sep"
                        >
                          ·
                        </span>
                      ) : null}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={clsx(
                          "pg-tracker-pop-chip",
                          selected && "is-selected"
                        )}
                        onClick={() =>
                          setSettings({ workDuration: minutes * 60 })
                        }
                      >
                        {minutes}m
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pg-tracker-pop-stats">
            <span className="pg-tracker-pop-stat">
              <span className="pg-tracker-pop-stat-value tabular-nums">
                {formatDuration(todayTotal, { compact: true })}
              </span>
              <span className="pg-tracker-pop-stat-label">today</span>
            </span>
            <span aria-hidden className="pg-tracker-pop-stat-sep">
              ·
            </span>
            <span className="pg-tracker-pop-stat">
              <span className="pg-tracker-pop-stat-value tabular-nums">
                {todayPomos}
              </span>
              <span className="pg-tracker-pop-stat-label">sessions</span>
            </span>
            <span aria-hidden className="pg-tracker-pop-stat-sep">
              ·
            </span>
            <span className="pg-tracker-pop-stat">
              <span className="pg-tracker-pop-stat-value">
                <Flame
                  size={11}
                  className={clsx(
                    "inline align-text-bottom",
                    streak > 0 && "pg-tracker-pop-flame"
                  )}
                  aria-hidden
                />{" "}
                <span className="tabular-nums">{streak}</span>
              </span>
              <span className="pg-tracker-pop-stat-label">streak</span>
            </span>
          </div>

          <div className="pg-tracker-pop-week">
            <div className="pg-tracker-pop-week-head">
              <div className="pg-tracker-pop-week-nav">
                <button
                  type="button"
                  className="pg-tracker-pop-nav-btn"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  aria-label="Previous week"
                  title="Previous week"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="pg-tracker-pop-week-label">{weekLabel}</span>
                <button
                  type="button"
                  className="pg-tracker-pop-nav-btn"
                  onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
                  aria-label="Next week"
                  title="Next week"
                  disabled={!canGoForward}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
              <span className="pg-tracker-pop-week-total tabular-nums">
                {formatDuration(weekTotal, { compact: true })}
              </span>
            </div>
            <div
              className="pg-tracker-pop-chart"
              role="img"
              aria-label={`Study time for ${weekLabel}, total ${formatDuration(
                weekTotal,
                { compact: true }
              )}`}
            >
              {weekData.map((d) => {
                // Only highlight today when we're actually looking at the
                // week that contains it — otherwise the user gets a
                // misleading accent bar on, say, last week's Wednesday.
                const isToday = d.key === todayK;
                const ratio = d.seconds / maxSeconds;
                return (
                  <div key={d.key} className="pg-tracker-pop-col">
                    <div className="pg-tracker-pop-bar-track">
                      <div
                        className={clsx(
                          "pg-tracker-pop-bar",
                          isToday && "is-today",
                          d.seconds === 0 && "is-empty"
                        )}
                        style={{
                          height: `${Math.max(d.seconds === 0 ? 0 : 4, ratio * 100)}%`,
                        }}
                        title={`${d.dayLabel} — ${formatDuration(d.seconds, {
                          compact: true,
                        })}`}
                      />
                    </div>
                    <div
                      className={clsx(
                        "pg-tracker-pop-col-label",
                        isToday && "is-today"
                      )}
                    >
                      {d.dayLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TimeTracker;
