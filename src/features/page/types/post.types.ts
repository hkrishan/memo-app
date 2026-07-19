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
  createdAt: Date | string;
  updatedAt: Date | string;
  media: AlbumPagePostMedia[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser?: boolean;
};

export type NewAlbumPagePostInput = {
  caption?: string | null;
  media: Array<{
    mediaType: AlbumPagePostMediaType;
    url: string;
    thumbnailUrl?: string | null;
    sortOrder?: number | null;
  }>;
};

export type AlbumPagePostsResponse = {
  posts: AlbumPagePost[];
  nextCursor: string | null;
  hasMore: boolean;
};
