import { endpoints, httpClient } from "@/lib/api";
import type { AlbumMember } from "@/features/album/types/album.types";
import {
  Page,
  PageProfile,
  CreatePageInput,
  UpdatePageInput,
} from "../types/page.types";

const pageApi = () => {
  const getPage = async (albumId: string) =>
    httpClient.get<Page | null>(endpoints.album.page.get(albumId));

  /** Public/follower view of a page profile — includes the viewer's status. */
  const getPageView = async (albumId: string, pageId: string) =>
    httpClient.get<PageProfile>(endpoints.album.page.view(albumId, pageId));

  /** The album members behind a page — same view access as the page. */
  const getPageMembers = async (albumId: string, pageId: string) =>
    httpClient.get<AlbumMember[]>(
      endpoints.album.page.members(albumId, pageId),
    );

  const createPage = async (albumId: string, input: CreatePageInput) =>
    httpClient.post<Page>(endpoints.album.page.create(albumId), input);

  const updatePage = async (
    albumId: string,
    pageId: string,
    input: UpdatePageInput,
  ) => httpClient.put<Page>(endpoints.album.page.update(albumId, pageId), input);

  /** null clears the page password (disables password access on the web). */
  const setWebPassword = async (
    albumId: string,
    pageId: string,
    password: string | null,
  ) =>
    httpClient.put<void>(endpoints.album.page.webPassword(albumId, pageId), {
      password,
    });

  return {
    getPage,
    getPageView,
    getPageMembers,
    createPage,
    updatePage,
    setWebPassword,
  };
};

export default pageApi;
