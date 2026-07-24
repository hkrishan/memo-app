import { AlbumPhoto } from "@/features/album/types/album.types";

export type Page = {
  pageId: string;
  albumId: string;
  pageHandle: string;
  pageTitle?: string;
  bio?: string | null;
  isPublic: boolean;
  createdAt: Date;
  coverPhoto: AlbumPhoto | null;
  /** A page password is set for web access to this (private) page. */
  hasWebPassword?: boolean;
  /** Public web address of this page (domain/@handle). */
  webUrl?: string;
};

/** Viewer's relationship to a page in the standalone page view. */
export type PageViewerStatus = "member" | "accepted" | "pending" | "none";

/** Page profile from the viewer endpoint — includes the viewer's follow status. */
export type PageProfile = Page & {
  myStatus: PageViewerStatus;
};

export type CreatePageInput = {
  pageHandle: string;
  title: string;
  isPublic: boolean;
};

export type UpdatePageInput = {
  title?: string;
  pageHandle?: string;
  isPublic?: boolean;
  // null clears the bio
  bio?: string | null;
  // null clears the cover photo
  coverPhotoId?: string | null;
};
