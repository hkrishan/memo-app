/**
 * Small shared helpers for the photo social components.
 */

import dayjs from "dayjs";

/** 999 -> "999", 1234 -> "1.2k", 12800 -> "12.8k", 1200000 -> "1.2m" */
export const formatCompactCount = (count: number): string => {
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const value = count / 1000;
    const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(1);
    return `${rounded.replace(/\.0$/, "")}k`;
  }
  const value = count / 1_000_000;
  return `${value.toFixed(1).replace(/\.0$/, "")}m`;
};

/**
 * THE app-wide short relative timestamp: "now", "5m", "3h", "2d", "3w",
 * else "Mar 4" (year added when it differs). Four screens used to ship
 * their own variants ("Just now" / "5m ago" / missing weeks) — import
 * this one instead of re-rolling it.
 */
export const formatRelativeTime = (input: string | Date): string => {
  const date = dayjs(input);
  const now = dayjs();
  const minutes = now.diff(date, "minute");
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = now.diff(date, "hour");
  if (hours < 24) return `${hours}h`;
  const days = now.diff(date, "day");
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return date.format(date.year() === now.year() ? "MMM D" : "MMM D, YYYY");
};

/** First letters of up to two words, uppercased. "Hugo Marks" -> "HM" */
export const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};
