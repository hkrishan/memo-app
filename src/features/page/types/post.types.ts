export type AlbumPagePostMediaType = "image" | "video";

export type AlbumPagePostMedia = {
  mediaId: string;
  postId: string;
  mediaType: AlbumPagePostMediaType;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number | null;
  createdAt: Date | string;
};

export type AlbumPagePost = {
  postId: string;
  albumId: string;
  pageId: string;
  authorId: string;
  caption: string | null;
  /** Author's position at post time (optional; pair is always complete). */
  latitude?: number | null;
  longitude?: number | null;
  /** Reverse-geocoded label ("Stockholm") shown in feeds. */
  locationName?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  media: AlbumPagePostMedia[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser?: boolean;
  /** Server-computed: the viewer is the post author or the album owner. */
  canDelete?: boolean;
};

export type NewAlbumPagePostInput = {
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  media: Array<{
    mediaType: AlbumPagePostMediaType;
    url: string;
    thumbnailUrl?: string | null;
    sortOrder?: number | null;
  }>;
};

export type PostCommentAuthor = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

/** Wire type for a post comment — mirrors the API contract exactly. */
export type PostComment = {
  commentId: string;
  postId: string;
  content: string;
  createdAt: string; // ISO string
  author: PostCommentAuthor;
};

export type AlbumPagePostsResponse = {
  posts: AlbumPagePost[];
  nextCursor: string | null;
  hasMore: boolean;
};
