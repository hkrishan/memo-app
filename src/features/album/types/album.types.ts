export type Role = "owner" | "contributor" | "viewer";

export type AlbumMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  /** Per-album identity color (server palette hex), null until picked. */
  color: string | null;
};

export type Album = {
  createdAt?: Date;
  updatedAt?: Date;
  albumId: string;
  ownerId: string;
  title: string;
  description: string | null;
  coverPhotoId?: string | null;
  coverPhotoUrl?: string | null;
  members?: AlbumMember[];
  recentPhotos?: AlbumPhoto[];
  albumCode: string;
  coverPhoto?: AlbumPhoto | null;
  /** Total number of photos/videos in the album. Optional — older cached
   *  responses may lack it. */
  photoCount?: number;
  /** Photos added by OTHER members since you last opened the album. */
  newPhotoCount?: number;
  /** Newest photo's ISO timestamp (for "latest added" sort); null when empty. */
  lastActivityAt?: string | null;
};

export type Photo = {
  photoId: string;
  albumId: string;
  uploadedBy: string;
  url: string;
  caption: string | null;
  createdAt: string;
  thumbnailUrl?: string | null;
  /**
   * Screen-sized frame for the fullscreen viewer — paging decodes this
   * instead of the multi-megabyte original. Null/absent falls back to url.
   */
  displayUrl?: string | null;
  /**
   * "video" for video uploads (thumbnailUrl is then the poster frame).
   * Optional — older cached responses may lack it; treat missing as "photo".
   */
  mediaType?: "photo" | "video";
  latitude?: number | null;
  longitude?: number | null;
};

export type AlbumPhoto = {
  photoId: string;
  url: string;
  createdAt: Date;
  thumbnailUrl?: string | null;
  /** See Photo.mediaType — optional, missing means "photo". */
  mediaType?: "photo" | "video";
};

export type PhotoComment = {
  commentId: string;
  photoId: string;
  content: string;
  createdAt: string;
  author: {
    userId: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type PhotoTag = {
  tag: string;
  /** userId of the member who added the tag */
  createdBy: string;
};

export type AlbumTagCount = {
  tag: string;
  count: number;
};

export type PhotoSocial = {
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  tags: PhotoTag[];
};

export type PhotoWithUploader = Photo & {
  uploader: {
    userId: string;
    name: string;
    avatarUrl: string | null;
  };
  // Optional — older cached responses may lack it
  social?: PhotoSocial;
};

export type ActivityUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type ActivityType = "photos_added";

export type AlbumActivity = {
  activityId: string;
  type: ActivityType;
  user: ActivityUser;
  photos: AlbumPhoto[];
  photoCount: number;
  createdAt: Date;
};

/** Multi-use album invite link. The inviteId doubles as the link token. */
export type AlbumInviteLink = {
  inviteId: string;
  url: string;
  role: Role;
  expiresAt: string;
};

/**
 * Preview of an invite as seen by a (possibly non-member) invitee.
 * Expired invites are deliberately bare on the wire (no album/inviter
 * data is leaked), so everything beyond id + status is optional — check
 * `status === "active"` before relying on the rest.
 */
export type InviteInfo = {
  inviteId: string;
  status: "active" | "expired";
  album?: {
    albumId: string;
    title: string;
    coverPhotoUrl: string | null;
    memberCount: number;
  };
  inviter?: {
    name: string;
    avatarUrl: string | null;
  };
  alreadyMember?: boolean;
};

export type AlbumJoinRequest = {
  requestId: string;
  albumId: string;
  requesterId: string;
  requester?: AlbumMember;
  codeUsed: string;
  status: "pending" | "accepted" | "declined";
  decidedAt: Date | null;
  createdAt: Date;
};
