import { httpClient, endpoints } from "@/lib/api";
import { AlbumsFeedResponse, FeedResponse } from "../types/feed.types";

const ALBUMS_PAGE_SIZE = 25;

const feedApi = {
  getFeed: () => httpClient.get<FeedResponse>(endpoints.feed),
  getAlbumsFeed: (cursor?: string) =>
    httpClient.get<AlbumsFeedResponse>(endpoints.feedAlbums, {
      params: { limit: ALBUMS_PAGE_SIZE, cursor },
    }),
};

export default feedApi;
