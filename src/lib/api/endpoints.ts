const endpoints = {
  feed: "/feed",
  auth: {
    // OAuth providers
    google: "/auth/google",
    apple: "/auth/apple",
    facebook: "/auth/facebook",
    // Email auth
    login: "/auth/login",
    register: "/auth/register",
    // Token management
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    // Test/dev
    testLogin: "/auth/test-login",
  },
  user: {
    profile: "/user/me",
  },
  album: {
    list: "/album",
    create: "/album",
    join: "/album/join-requests",
    pendingJoinRequests: (albumId: string) =>
      `/album/${albumId}/join-requests/pending`,
    acceptJoinRequest: (albumId: string, requestId: string) =>
      `/album/${albumId}/join-requests/${requestId}/accept`,
    rejectJoinRequest: (albumId: string, requestId: string) =>
      `/album/${albumId}/join-requests/${requestId}/reject`,
    get: (albumId: string) => `/album/${albumId}`,
    update: (albumId: string) => `/album/${albumId}`,
    delete: (albumId: string) => `/album/${albumId}`,
    activities: (albumId: string) => `/album/${albumId}/activity`,
    members: (albumId: string) => `/album/${albumId}/members`,
    // Photosrr
    photos: (albumId: string) => `/album/${albumId}/photos`,
    uploadPhoto: (albumId: string) => `/album/${albumId}/photos`,
    deletePhoto: (albumId: string, photoId: string) =>
      `/album/${albumId}/photos/${photoId}`,
    page: {
      create: (albumId: string) => `/album/${albumId}/page`,
      get: (albumId: string) => `/album/${albumId}/page`,
      posts: {
        list: (albumId: string, pageId: string) =>
          `/album/${albumId}/page/${pageId}/posts`,
        create: (albumId: string, pageId: string) =>
          `/album/${albumId}/page/${pageId}/posts`,
        like: (albumId: string, pageId: string, postId: string) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/like`,
        unlike: (albumId: string, pageId: string, postId: string) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/like`,
      },
    },
  },
};

export default endpoints;
