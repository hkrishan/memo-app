import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import pagePostApi, { ListPostsParams } from "./pagePost.api";
import {
  AlbumPagePost,
  AlbumPagePostsResponse,
  NewAlbumPagePostInput,
} from "../types/post.types";

const POST_QUERY_KEY = "pagePosts";

export const usePagePostsQuery = (
  albumId: string,
  pageId: string,
  options?: { enabled?: boolean }
) => {
  return useInfiniteQuery({
    queryKey: [POST_QUERY_KEY, albumId, pageId],
    queryFn: ({ pageParam }) =>
      pagePostApi().listPosts(albumId, pageId, {
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreatePostMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      pageId,
      input,
    }: {
      albumId: string;
      pageId: string;
      input: NewAlbumPagePostInput;
    }) => pagePostApi().createPost(albumId, pageId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [POST_QUERY_KEY, variables.albumId, variables.pageId],
      });
    },
  });
};

export const useLikePostMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      pageId,
      postId,
    }: {
      albumId: string;
      pageId: string;
      postId: string;
    }) => pagePostApi().likePost(albumId, pageId, postId),
    onMutate: async ({ albumId, pageId, postId }) => {
      await queryClient.cancelQueries({
        queryKey: [POST_QUERY_KEY, albumId, pageId],
      });

      const previousData = queryClient.getQueryData<{
        pages: AlbumPagePostsResponse[];
      }>([POST_QUERY_KEY, albumId, pageId]);

      queryClient.setQueryData<{ pages: AlbumPagePostsResponse[] }>(
        [POST_QUERY_KEY, albumId, pageId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.postId === postId
                  ? {
                      ...post,
                      likedByCurrentUser: true,
                      likeCount: post.likeCount + 1,
                    }
                  : post
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, { albumId, pageId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          [POST_QUERY_KEY, albumId, pageId],
          context.previousData
        );
      }
    },
  });
};

export const useUnlikePostMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      pageId,
      postId,
    }: {
      albumId: string;
      pageId: string;
      postId: string;
    }) => pagePostApi().unlikePost(albumId, pageId, postId),
    onMutate: async ({ albumId, pageId, postId }) => {
      await queryClient.cancelQueries({
        queryKey: [POST_QUERY_KEY, albumId, pageId],
      });

      const previousData = queryClient.getQueryData<{
        pages: AlbumPagePostsResponse[];
      }>([POST_QUERY_KEY, albumId, pageId]);

      queryClient.setQueryData<{ pages: AlbumPagePostsResponse[] }>(
        [POST_QUERY_KEY, albumId, pageId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.postId === postId
                  ? {
                      ...post,
                      likedByCurrentUser: false,
                      likeCount: Math.max(0, post.likeCount - 1),
                    }
                  : post
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, { albumId, pageId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          [POST_QUERY_KEY, albumId, pageId],
          context.previousData
        );
      }
    },
  });
};
