// Moderation type definitions (reporting UGC + blocking users)

export type ReportTargetType =
  | "photo"
  | "photo_comment"
  | "page_post"
  | "post_comment"
  | "chat_message"
  | "user"
  | "album";

export type ReportReason =
  | "spam"
  | "nudity"
  | "harassment"
  | "hate"
  | "violence"
  | "impersonation"
  | "other";

/** What is being reported — carried from the surface into the report flow. */
export type ReportTarget = {
  targetType: ReportTargetType;
  targetId: string;
  /** Required for album-scoped content (photos, chat messages, posts…). */
  albumId?: string;
};

export type ReportContentParams = ReportTarget & {
  reason: ReportReason;
  details?: string;
};

export type ReportContentResponse = {
  reportId: string;
};

export type BlockedUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  blockedAt: string;
};

/** The 7 reasons, in display order, with human-readable labels. */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "violence", label: "Violence or dangerous content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];
