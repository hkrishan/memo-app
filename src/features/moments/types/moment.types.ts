/**
 * Moments — time-boxed photo games inside an album (surprise daily drops,
 * challenges with a deadline). Mirrors the backend contract exactly.
 */

export type MomentType = "daily_drop" | "challenge";

export type MomentStatus = "active" | "ended" | "cancelled";

export type MomentEventStatus = "scheduled" | "open" | "closed";

export type SubmissionValidationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "skipped";

export type DailyDropConfig = {
  days: number;
  dropsPerDay: number;
  windowStartHour: number;
  windowEndHour: number;
  responseWindowMinutes: number;
};

export type ChallengeConfig = {
  prompt: string;
  deadlineAt: string;
};

export type MomentConfig = DailyDropConfig | ChallengeConfig;

/** Same user shape as album members */
export type MomentUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type MomentSubmissionPhoto = {
  photoId: string;
  url: string;
  thumbnailUrl: string | null;
  /**
   * "video" for video submissions (thumbnailUrl is then the poster frame;
   * older videos may still have a null thumbnail). Optional — cached
   * responses may lack it; treat missing as "photo".
   */
  mediaType?: "photo" | "video";
};

export type MomentSubmission = {
  submissionId: string;
  eventId: string;
  userId: string;
  photoId: string;
  late: boolean;
  validationStatus: SubmissionValidationStatus;
  validationReason: string | null;
  createdAt: string;
  user: MomentUser;
  /** null when the submission is locked for the viewer */
  photo: MomentSubmissionPhoto | null;
  /** Secondary (front-camera) shot of a BeReal-style dual capture */
  frontPhoto: MomentSubmissionPhoto | null;
  /**
   * BeReal lock: true when the viewer has NOT posted to this event yet
   * (daily_drop only) — photos are hidden (null) but the submitter's
   * identity and timing stay visible. The viewer's own submission is
   * never locked.
   */
  locked: boolean;
};

export type MomentEvent = {
  eventId: string;
  momentId: string;
  /** null for not-yet-fired daily_drop events — drop times are a surprise */
  scheduledAt: string | null;
  firedAt: string | null;
  deadlineAt: string;
  status: MomentEventStatus;
  submissions: MomentSubmission[];
};

export type Moment = {
  momentId: string;
  albumId: string;
  type: MomentType;
  title: string;
  status: MomentStatus;
  createdBy: string;
  config: MomentConfig;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  events: MomentEvent[];
};

export type CreateMomentInput = {
  type: MomentType;
  title?: string;
  config: MomentConfig;
};

/**
 * An OPEN event the user has not submitted to yet (deadline still in the
 * future), across all their albums — GET /user/me/open-drops.
 */
export type OpenDrop = {
  albumId: string;
  albumTitle: string;
  momentId: string;
  momentType: MomentType;
  momentTitle: string;
  eventId: string;
  firedAt: string | null;
  deadlineAt: string;
};

/** Late submissions are accepted up to this long past an event's deadline */
export const LATE_WINDOW_MS = 60 * 60 * 1000;
