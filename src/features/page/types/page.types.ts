import { AlbumPhoto } from "@/features/album/types/album.types";

export type Page = {
  pageId: string;
  albumId: string;
  pageHandle: string;
  pageTitle?: string;
  isPublic: boolean;
  createdAt: Date;
  coverPhoto: AlbumPhoto | null;
};

export type CreatePageInput = {
  pageHandle: string;
  title: string;
  isPublic: boolean;
};
