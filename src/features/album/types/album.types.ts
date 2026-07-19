export type Role = "owner" | "contributor" | "viewer";

export type AlbumMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
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
};

export type Photo = {
  photoId: string;
  albumId: string;
  uploadedBy: string;
  url: string;
  caption: string | null;
  createdAt: string;
  thumbnailUrl?: string | null;
};

export type AlbumPhoto = {
  photoId: string;
  url: string;
  createdAt: Date;
  thumbnailUrl?: string | null;
};

export type PhotoWithUploader = Photo & {
  uploader: {
    userId: string;
    name: string;
    avatarUrl: string | null;
  };
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
