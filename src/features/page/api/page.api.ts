import { endpoints, httpClient } from "@/lib/api";
import { Page, CreatePageInput, UpdatePageInput } from "../types/page.types";

const pageApi = () => {
  const getPage = async (albumId: string) =>
    httpClient.get<Page | null>(endpoints.album.page.get(albumId));

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
    createPage,
    updatePage,
    setWebPassword,
  };
};

export default pageApi;
