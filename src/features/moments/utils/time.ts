import { useEffect, useState } from "react";

/**
 * Current time, re-rendered every `intervalMs`. Drives the countdowns —
 * a plain interval + state, nothing heavier.
 */
export const useNow = (intervalMs: number, enabled: boolean = true): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
};

/** 95_000ms → "01:35". Clamps at 0. */
export const formatMmSs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

/** Coarse remaining time: "2d 4h left", "4h 12m left", "38m left". */
export const formatCoarseRemaining = (ms: number): string => {
  if (ms <= 0) return "Ended";
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};

/** "9" → "9:00", "22" → "22:00" */
export const formatHour = (hour: number): string => `${hour}:00`;

/** Short absolute date: "Jul 12" (with year when it differs). */
export const formatShortDate = (iso: string): string => {
  const date = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) {
    opts.year = "numeric";
  }
  return date.toLocaleDateString(undefined, opts);
};

/** Deadline blurb for challenges: "today 18:00", "Jul 24, 9:00" */
export const formatDeadline = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `today ${time}`;
  return `${formatShortDate(iso)}, ${time}`;
};
