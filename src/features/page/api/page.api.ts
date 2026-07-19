import { endpoints, httpClient } from "@/lib/api";
import { Page, CreatePageInput } from "../types/page.types";

const pageApi = () => {
  const getPage = async (albumId: string) =>
    httpClient.get<Page | null>(endpoints.album.page.get(albumId));

  const createPage = async (albumId: string, input: CreatePageInput) =>
    httpClient.post<Page>(endpoints.album.page.create(albumId), input);

  return {
    getPage,
    createPage,
  };
};

export default pageApi;
