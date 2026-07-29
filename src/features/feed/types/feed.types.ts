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
  /** Server-computed: the viewer is the post author or the album owner. */
  canDelete?: boolean;
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

// ---------------------------------------------------------------------------
// Albums feed (GET /feed/albums) — cross-album updates timeline
// ---------------------------------------------------------------------------

export interface AlbumUpdatePhoto {
  photoId: string;
  url: string;
  thumbnailUrl: string | null;
  mediaType: "photo" | "video";
}

interface AlbumUpdateBase {
  id: string;
  albumId: string;
  albumTitle: string;
  actor: FeedUser;
  createdAt: string;
}

export interface PhotosAddedUpdate extends AlbumUpdateBase {
  type: "photos_added";
  /** Up to 4 newest of the group */
  photos: AlbumUpdatePhoto[];
  photoCount: number;
}

export interface MemberJoinedUpdate extends AlbumUpdateBase {
  type: "member_joined";
}

export interface MomentStartedUpdate extends AlbumUpdateBase {
  type: "moment_started";
  moment: {
    momentId: string;
    momentType: "daily_drop" | "challenge";
    title: string;
  };
}

export type AlbumFeedUpdate =
  | PhotosAddedUpdate
  | MemberJoinedUpdate
  | MomentStartedUpdate;

export interface AlbumsFeedResponse {
  items: AlbumFeedUpdate[];
  nextCursor: string | null;
}
