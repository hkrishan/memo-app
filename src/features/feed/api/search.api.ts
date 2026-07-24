import { httpClient, endpoints } from "@/lib/api";
import { PageSearchResponse } from "../types/search.types";

/** Follow result: "accepted" for public pages, "pending" for private ones. */
type FollowResult = { status: "accepted" | "pending" };

const searchApi = {
  searchPages: (query: string) =>
    httpClient.get<PageSearchResponse>(endpoints.feedSearchPages, {
      params: { q: query },
    }),

  followPage: (albumId: string, pageId: string) =>
    httpClient.post<FollowResult>(endpoints.pageFollow(albumId, pageId)),

  unfollowPage: (albumId: string, pageId: string) =>
    httpClient.delete<void>(endpoints.pageFollow(albumId, pageId)),
};

export default searchApi;
