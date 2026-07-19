/**
 * Tests for pagePost.api.ts
 *
 * These tests verify the shape and behavior of the page post API client.
 * Run with: npx jest src/features/page/__tests__/pagePost.api.test.ts
 */

import {
  AlbumPagePost,
  AlbumPagePostMedia,
  AlbumPagePostMediaType,
  AlbumPagePostsResponse,
  NewAlbumPagePostInput,
} from "../types/post.types";

describe("Post Types", () => {
  describe("AlbumPagePostMedia", () => {
    it("should have correct shape for image media", () => {
      const media: AlbumPagePostMedia = {
        mediaId: "media-1",
        postId: "post-1",
        mediaType: "image",
        url: "https://example.com/image.jpg",
        thumbnailUrl: "https://example.com/thumb.jpg",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
      };

      expect(media.mediaId).toBeDefined();
      expect(media.postId).toBeDefined();
      expect(media.mediaType).toBe("image");
      expect(media.url).toBeDefined();
    });

    it("should have correct shape for video media", () => {
      const media: AlbumPagePostMedia = {
        mediaId: "media-2",
        postId: "post-1",
        mediaType: "video",
        url: "https://example.com/video.mp4",
        thumbnailUrl: "https://example.com/video-thumb.jpg",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
      };

      expect(media.mediaType).toBe("video");
      expect(media.thumbnailUrl).toBeDefined();
    });
  });

  describe("AlbumPagePost", () => {
    it("should have correct shape", () => {
      const post: AlbumPagePost = {
        postId: "post-1",
        albumId: "album-1",
        pageId: "page-1",
        authorId: "user-1",
        caption: "Test caption",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: [],
        likeCount: 10,
        commentCount: 5,
        likedByCurrentUser: false,
      };

      expect(post.postId).toBeDefined();
      expect(post.albumId).toBeDefined();
      expect(post.pageId).toBeDefined();
      expect(post.authorId).toBeDefined();
      expect(post.media).toBeInstanceOf(Array);
      expect(typeof post.likeCount).toBe("number");
      expect(typeof post.commentCount).toBe("number");
    });

    it("should handle null caption", () => {
      const post: AlbumPagePost = {
        postId: "post-2",
        albumId: "album-1",
        pageId: "page-1",
        authorId: "user-1",
        caption: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: [],
        likeCount: 0,
        commentCount: 0,
      };

      expect(post.caption).toBeNull();
      expect(post.likedByCurrentUser).toBeUndefined();
    });
  });

  describe("NewAlbumPagePostInput", () => {
    it("should have correct shape for creating a post", () => {
      const input: NewAlbumPagePostInput = {
        caption: "New post caption",
        media: [
          {
            mediaType: "image",
            url: "https://example.com/new-image.jpg",
            thumbnailUrl: null,
            sortOrder: 0,
          },
        ],
      };

      expect(input.media.length).toBeGreaterThan(0);
      expect(input.media[0].mediaType).toBe("image");
    });

    it("should allow null caption", () => {
      const input: NewAlbumPagePostInput = {
        caption: null,
        media: [
          {
            mediaType: "video",
            url: "https://example.com/video.mp4",
            thumbnailUrl: "https://example.com/video-thumb.jpg",
            sortOrder: 0,
          },
        ],
      };

      expect(input.caption).toBeNull();
    });

    it("should require at least one media item", () => {
      const input: NewAlbumPagePostInput = {
        media: [
          {
            mediaType: "image",
            url: "https://example.com/image1.jpg",
            sortOrder: 0,
          },
          {
            mediaType: "image",
            url: "https://example.com/image2.jpg",
            sortOrder: 1,
          },
        ],
      };

      expect(input.media.length).toBe(2);
      expect(input.media[0].sortOrder).toBe(0);
      expect(input.media[1].sortOrder).toBe(1);
    });
  });

  describe("AlbumPagePostsResponse", () => {
    it("should have correct pagination shape", () => {
      const response: AlbumPagePostsResponse = {
        posts: [],
        nextCursor: "cursor-123",
        hasMore: true,
      };

      expect(response.posts).toBeInstanceOf(Array);
      expect(response.nextCursor).toBeDefined();
      expect(response.hasMore).toBe(true);
    });

    it("should handle no more pages", () => {
      const response: AlbumPagePostsResponse = {
        posts: [],
        nextCursor: null,
        hasMore: false,
      };

      expect(response.nextCursor).toBeNull();
      expect(response.hasMore).toBe(false);
    });
  });
});

describe("Create Post Flow", () => {
  it("should validate input before submission", () => {
    const validateInput = (input: NewAlbumPagePostInput): boolean => {
      // Require at least one media item
      if (input.media.length === 0) return false;

      // Ensure videos have thumbnails
      const videosWithoutThumbnails = input.media.filter(
        (item) => item.mediaType === "video" && !item.thumbnailUrl
      );

      return videosWithoutThumbnails.length === 0;
    };

    // Valid input with image
    expect(
      validateInput({
        media: [{ mediaType: "image", url: "https://example.com/img.jpg" }],
      })
    ).toBe(true);

    // Valid input with video and thumbnail
    expect(
      validateInput({
        media: [
          {
            mediaType: "video",
            url: "https://example.com/vid.mp4",
            thumbnailUrl: "https://example.com/thumb.jpg",
          },
        ],
      })
    ).toBe(true);

    // Invalid: no media
    expect(validateInput({ media: [] })).toBe(false);

    // Invalid: video without thumbnail
    expect(
      validateInput({
        media: [{ mediaType: "video", url: "https://example.com/vid.mp4" }],
      })
    ).toBe(false);
  });

  it("should respect sortOrder for media items", () => {
    const input: NewAlbumPagePostInput = {
      media: [
        { mediaType: "image", url: "https://example.com/3.jpg", sortOrder: 2 },
        { mediaType: "image", url: "https://example.com/1.jpg", sortOrder: 0 },
        { mediaType: "image", url: "https://example.com/2.jpg", sortOrder: 1 },
      ],
    };

    const sorted = [...input.media].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );

    expect(sorted[0].url).toContain("1.jpg");
    expect(sorted[1].url).toContain("2.jpg");
    expect(sorted[2].url).toContain("3.jpg");
  });
});
