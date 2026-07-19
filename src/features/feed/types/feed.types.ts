// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface FeedUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface FeedAlbum {
  albumId: string;
  title: string;
}

export interface FeedPhoto {
  photoId: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// album_activity item
// ---------------------------------------------------------------------------

export interface AlbumActivity {
  activityId: string;
  type: string; // e.g. "photos_added"
  user: FeedUser;
  photos: FeedPhoto[];
  photoCount: number;
  createdAt: string;
}

export interface AlbumActivityFeedItem {
  type: "album_activity";
  createdAt: string;
  activity: AlbumActivity;
  album: FeedAlbum;
}

// ---------------------------------------------------------------------------
// page_post item
// ---------------------------------------------------------------------------

export interface PostMedia {
  mediaId: string;
  postId: string;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number | null;
  createdAt: string;
}

export interface PagePost {
  postId: string;
  albumId: string;
  pageId: string;
  authorId: string;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  media: PostMedia[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
}

export interface FeedPage {
  pageId: string;
  pageHandle: string;
  pageTitle: string;
  albumId: string;
}

export interface PagePostFeedItem {
  type: "page_post";
  createdAt: string;
  post: PagePost;
  page: FeedPage;
  author: FeedUser;
}

// ---------------------------------------------------------------------------
// Union type for all feed items
// ---------------------------------------------------------------------------

export type FeedItem = AlbumActivityFeedItem | PagePostFeedItem;

// ---------------------------------------------------------------------------
// API response
// ---------------------------------------------------------------------------

export interface FeedResponse {
  items: FeedItem[];
}
