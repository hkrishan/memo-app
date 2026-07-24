/**
 * Per-album member identity colors.
 *
 * Every album member picks one color from a fixed 12-color palette (the
 * server enforces uniqueness per album while free colors remain). The
 * color tints the member's avatar ring / name label wherever they appear
 * in album context (members list, photo attribution, chat, drops).
 *
 * MEMBER_COLOR_PALETTE must match the server's palette EXACTLY, same order.
 */

export const MEMBER_COLOR_PALETTE = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#00C7BE",
  "#32ADE6",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#FF6482",
  "#A2845E",
] as const;

/** Neutral tint for members who haven't picked a color yet. */
export const MEMBER_COLOR_FALLBACK = "#8E8E93";

/**
 * The member's identity color, or a neutral gray fallback when the member
 * is unknown or hasn't picked one yet.
 */
export const memberColor = (
  member: { color?: string | null } | undefined,
): string => member?.color ?? MEMBER_COLOR_FALLBACK;
