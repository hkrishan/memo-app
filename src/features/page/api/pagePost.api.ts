import { endpoints, httpClient } from "@/lib/api";
import {
  AlbumPagePost,
  AlbumPagePostsResponse,
  NewAlbumPagePostInput,
} from "../types/post.types";

export type ListPostsParams = {
  cursor?: string;
  limit?: number;
};

const pagePostApi = () => {
  const createPost = async (
    albumId: string,
    pageId: string,
    input: NewAlbumPagePostInput
  ): Promise<AlbumPagePost> => {
    return httpClient.post<AlbumPagePost>(
      endpoints.album.page.posts.create(albumId, pageId),
      input
    );
  };

  const listPosts = async (
    albumId: string,
    pageId: string,
    params?: ListPostsParams
  ): Promise<AlbumPagePostsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.cursor) {
      queryParams.set("cursor", params.cursor);
    }
    if (params?.limit) {
      queryParams.set("limit", params.limit.toString());
    }

    const url = `${endpoints.album.page.posts.list(albumId, pageId)}${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;

    const response = await httpClient.get<AlbumPagePostsResponse | AlbumPagePost[]>(url);

    // Handle both array response and paginated response formats
    if (Array.isArray(response)) {
      return {
        posts: response,
        hasMore: false,
        nextCursor: null,
      };
    }

    return response;
  };

  const likePost = async (
    albumId: string,
    pageId: string,
    postId: string
  ): Promise<void> => {
    return httpClient.post(
      endpoints.album.page.posts.like(albumId, pageId, postId),
      {}
    );
  };

  const unlikePost = async (
    albumId: string,
    pageId: string,
    postId: string
  ): Promise<void> => {
    return httpClient.delete(
      endpoints.album.page.posts.unlike(albumId, pageId, postId)
    );
  };

  return {
    createPost,
    listPosts,
    likePost,
    unlikePost,
  };
};

export default pagePostApi;
