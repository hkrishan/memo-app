import {
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import { notify } from "@/components/global";
import type { FeedResponse, PagePost } from "@/features/feed/types/feed.types";
import pagePostApi from "./pagePost.api";
import {
  AlbumPagePost,
  AlbumPagePostsResponse,
  NewAlbumPagePostInput,
  PostComment,
} from "../types/post.types";

export const pagePostKeys = {
  all: ["pagePosts"] as const,
  list: (albumId: string, pageId: string) =>
    [...pagePostKeys.all, albumId, pageId] as const,
  // Deliberately NOT nested under list(): the like mutation invalidates the
  // list on settle, and a shared prefix would drag open comment queries
  // (cancel/refetch) along with every heart toggle
  comments: (albumId: string, pageId: string, postId: string | null) =>
    [...pagePostKeys.all, "comments", albumId, pageId, postId] as const,
};

type PostSocialSnapshot = Pick<
  AlbumPagePost,
  "likeCount" | "commentCount" | "likedByCurrentUser"
>;

/** Patch one post in the page-posts infinite list cache (if present). */
const updatePostInList = (
  queryClient: QueryClient,
  albumId: string,
  pageId: string,
  postId: string,
  updater: (post: AlbumPagePost) => AlbumPagePost,
) => {
  queryClient.setQueryData<InfiniteData<AlbumPagePostsResponse>>(
    pagePostKeys.list(albumId, pageId),
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          posts: page.posts.map((post) =>
            post.postId === postId ? updater(post) : post,
          ),
        })),
      },
  );
};

/** Patch the same post in the home-feed cache (if present). */
const updatePostInFeed = (
  queryClient: QueryClient,
  postId: string,
  updater: (post: PagePost) => PagePost,
) => {
  queryClient.setQueryData<FeedResponse>(
    queryKeys.feed.list,
    (old) =>
      old && {
        ...old,
        items: old.items.map((item) =>
          item.type === "page_post" && item.post.postId === postId
            ? { ...item, post: updater(item.post) }
            : item,
        ),
      },
  );
};

/** Patch a post's social fields wherever it lives (page list + feed). */
const updatePostEverywhere = (
  queryClient: QueryClient,
  albumId: string,
  pageId: string,
  postId: string,
  patch: (social: PostSocialSnapshot) => Partial<PostSocialSnapshot>,
) => {
  updatePostInList(queryClient, albumId, pageId, postId, (post) => ({
    ...post,
    ...patch(post),
  }));
  updatePostInFeed(queryClient, postId, (post) => ({
    ...post,
    ...patch(post),
  }));
};

const snapshotPost = (
  queryClient: QueryClient,
  albumId: string,
  pageId: string,
  postId: string,
): {
  previousListPost?: PostSocialSnapshot;
  previousFeedPost?: PostSocialSnapshot;
} => {
  const listPost = queryClient
    .getQueryData<InfiniteData<AlbumPagePostsResponse>>(
      pagePostKeys.list(albumId, pageId),
    )
    ?.pages.flatMap((page) => page.posts)
    .find((post) => post.postId === postId);
  const feedItem = queryClient
    .getQueryData<FeedResponse>(queryKeys.feed.list)
    ?.items.find(
      (item) => item.type === "page_post" && item.post.postId === postId,
    );
  const feedPost =
    feedItem?.type === "page_post" ? feedItem.post : undefined;
  const pick = (post: {
    likeCount: number;
    commentCount: number;
    likedByCurrentUser?: boolean;
  }): PostSocialSnapshot => ({
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByCurrentUser: post.likedByCurrentUser,
  });
  return {
    previousListPost: listPost ? pick(listPost) : undefined,
    previousFeedPost: feedPost ? pick(feedPost) : undefined,
  };
};

/** Mark the OTHER copies of a post's counts stale so both surfaces settle
 *  on server truth without yanking the screen the user is looking at. */
const invalidateBothSurfaces = (
  queryClient: QueryClient,
  albumId: string,
  pageId: string,
) => {
  queryClient.invalidateQueries({
    queryKey: pagePostKeys.list(albumId, pageId),
    exact: true,
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.feed.list });
};

export const usePagePostsQuery = (
  albumId: string,
  pageId: string,
  options?: { enabled?: boolean }
) => {
  return useInfiniteQuery({
    queryKey: pagePostKeys.list(albumId, pageId),
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
        queryKey: pagePostKeys.list(variables.albumId, variables.pageId),
        exact: true,
      });
    },
  });
};

/**
 * Like/unlike toggle with optimistic updates to BOTH the page-posts list
 * and the home-feed caches. Mirrors useTogglePhotoLikeMutation:
 * - `scope` serializes toggles per post so rapid taps can't race
 * - per-post snapshot/rollback (never clobbers the whole list on error)
 * - cancelQueries before mutating so an in-flight GET can't wipe the
 *   optimistic state
 * The endpoints return 204 (no authoritative counts), so both surfaces
 * are invalidated on settle to reconcile with the server.
 */
export const useTogglePostLikeMutation = (
  albumId: string,
  pageId: string,
  postId: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Same-scope mutations run serially: a double-tap's unlike waits for
    // the like to settle, so responses can never reconcile out of order
    scope: { id: `post-like-${postId}` },
    mutationFn: ({ like }: { like: boolean }) =>
      like
        ? pagePostApi().likePost(albumId, pageId, postId)
        : pagePostApi().unlikePost(albumId, pageId, postId),
    onMutate: async ({ like }) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: pagePostKeys.list(albumId, pageId),
          exact: true,
        }),
        queryClient.cancelQueries({ queryKey: queryKeys.feed.list }),
      ]);
      // Snapshot ONLY this post's social fields — a whole-list snapshot
      // would, on rollback, clobber refetches and other posts' updates
      // that landed while this request was in flight
      const snapshots = snapshotPost(queryClient, albumId, pageId, postId);
      updatePostEverywhere(queryClient, albumId, pageId, postId, (post) => ({
        likedByCurrentUser: like,
        likeCount: Math.max(0, post.likeCount + (like ? 1 : -1)),
      }));
      return snapshots;
    },
    onError: (_error, _variables, context) => {
      if (context?.previousListPost) {
        const previous = context.previousListPost;
        updatePostInList(queryClient, albumId, pageId, postId, (post) => ({
          ...post,
          ...previous,
        }));
      }
      if (context?.previousFeedPost) {
        const previous = context.previousFeedPost;
        updatePostInFeed(queryClient, postId, (post) => ({
          ...post,
          ...previous,
        }));
      }
    },
    onSettled: () => {
      // The rollback itself can be stale, and success responses carry no
      // counts — let the server settle both surfaces
      invalidateBothSurfaces(queryClient, albumId, pageId);
    },
  });
};

/**
 * Delete a post (author or album owner — the server enforces it). The post
 * is optimistically removed from BOTH the page-posts list and the home-feed
 * caches; unlike the like toggle, deletion is structural, so the rollback
 * restores whole-cache snapshots (a one-shot destructive action can't race
 * itself the way rapid heart taps can).
 */
export const useDeletePostMutation = (albumId: string, pageId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: string }) =>
      pagePostApi().deletePost(albumId, pageId, postId),
    onMutate: async ({ postId }) => {
      // An in-flight GET resolving after the removal would resurrect the post
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: pagePostKeys.list(albumId, pageId),
          exact: true,
        }),
        queryClient.cancelQueries({ queryKey: queryKeys.feed.list }),
      ]);

      const previousList = queryClient.getQueryData<
        InfiniteData<AlbumPagePostsResponse>
      >(pagePostKeys.list(albumId, pageId));
      const previousFeed = queryClient.getQueryData<FeedResponse>(
        queryKeys.feed.list,
      );

      queryClient.setQueryData<InfiniteData<AlbumPagePostsResponse>>(
        pagePostKeys.list(albumId, pageId),
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.filter((post) => post.postId !== postId),
            })),
          },
      );
      queryClient.setQueryData<FeedResponse>(
        queryKeys.feed.list,
        (old) =>
          old && {
            ...old,
            items: old.items.filter(
              (item) =>
                !(item.type === "page_post" && item.post.postId === postId),
            ),
          },
      );

      return { previousList, previousFeed };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(
          pagePostKeys.list(albumId, pageId),
          context.previousList,
        );
      }
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed.list, context.previousFeed);
      }
      notify.error("Couldn't delete post", "Please try again");
    },
    onSettled: () => {
      invalidateBothSurfaces(queryClient, albumId, pageId);
    },
  });
};

export const usePostCommentsQuery = (
  albumId: string,
  pageId: string,
  postId: string | null,
) => {
  return useQuery({
    queryKey: pagePostKeys.comments(albumId, pageId, postId),
    queryFn: async () => {
      const { comments } = await pagePostApi().getComments(
        albumId,
        pageId,
        postId!,
      );
      return comments;
    },
    enabled: !!postId,
  });
};

export const useAddPostCommentMutation = (albumId: string, pageId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      pagePostApi().addComment(albumId, pageId, postId, content),
    // A comments GET dispatched before the POST committed would, resolving
    // after it, wipe the appended comment with its older server snapshot
    onMutate: async ({ postId }) => {
      await queryClient.cancelQueries({
        queryKey: pagePostKeys.comments(albumId, pageId, postId),
      });
    },
    onSuccess: (comment, { postId }) => {
      queryClient.setQueryData<PostComment[]>(
        pagePostKeys.comments(albumId, pageId, postId),
        (comments) => (comments ? [...comments, comment] : [comment]),
      );
      updatePostEverywhere(queryClient, albumId, pageId, postId, (post) => ({
        commentCount: post.commentCount + 1,
      }));
    },
    // Refetch regardless of outcome: reconciles the hand-patched list with
    // the server and revives the initial GET if onMutate cancelled it
    onSettled: (_data, _error, { postId }) => {
      queryClient.invalidateQueries({
        queryKey: pagePostKeys.comments(albumId, pageId, postId),
      });
      invalidateBothSurfaces(queryClient, albumId, pageId);
    },
  });
};

export const useDeletePostCommentMutation = (
  albumId: string,
  pageId: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      postId,
      commentId,
    }: {
      postId: string;
      commentId: string;
    }) => pagePostApi().deleteComment(albumId, pageId, postId, commentId),
    // Same in-flight-GET race as addComment — see there
    onMutate: async ({ postId }) => {
      await queryClient.cancelQueries({
        queryKey: pagePostKeys.comments(albumId, pageId, postId),
      });
    },
    onSuccess: (_data, { postId, commentId }) => {
      queryClient.setQueryData<PostComment[]>(
        pagePostKeys.comments(albumId, pageId, postId),
        (comments) => comments?.filter((c) => c.commentId !== commentId),
      );
      updatePostEverywhere(queryClient, albumId, pageId, postId, (post) => ({
        commentCount: Math.max(0, post.commentCount - 1),
      }));
    },
    onSettled: (_data, _error, { postId }) => {
      queryClient.invalidateQueries({
        queryKey: pagePostKeys.comments(albumId, pageId, postId),
      });
      invalidateBothSurfaces(queryClient, albumId, pageId);
    },
  });
};
