import { httpClient, endpoints } from "@/lib/api";
import { FeedResponse } from "../types/feed.types";

const feedApi = {
  getFeed: () => httpClient.get<FeedResponse>(endpoints.feed),
};

export default feedApi;
