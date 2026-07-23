/**
 * Wire types for the photo social feature (likes, comments, tags).
 * Mirrors the fixed API contract exactly.
 */

export type PhotoCommentAuthor = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type PhotoComment = {
  commentId: string;
  photoId: string;
  content: string;
  createdAt: string; // ISO string
  author: PhotoCommentAuthor;
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
