const endpoints = {
  feed: "/feed",
  feedAlbums: "/feed/albums",
  auth: {
    // OAuth providers
    google: "/auth/google",
    apple: "/auth/apple",
    facebook: "/auth/facebook",
    // Email auth
    login: "/auth/login",
    register: "/auth/register",
    // SMS OTP auth
    smsRequest: "/auth/sms/request",
    smsVerify: "/auth/sms/verify",
    // Token management
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    // Test/dev
    testLogin: "/auth/test-login",
  },
  user: {
    profile: "/user/me",
    avatar: "/user/me/avatar",
    pushToken: "/user/me/push-token",
    openDrops: "/user/me/open-drops",
    blocks: "/user/me/blocks",
    block: (userId: string) => `/user/me/blocks/${userId}`,
  },
  moderation: {
    report: "/moderation/report",
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
    leave: (albumId: string) => `/album/${albumId}/leave`,
    activities: (albumId: string) => `/album/${albumId}/activity`,
    // Invite links
    invites: (albumId: string) => `/album/${albumId}/invites`,
    invite: (albumId: string, inviteId: string) =>
      `/album/${albumId}/invites/${inviteId}`,
    members: (albumId: string) => `/album/${albumId}/members`,
    notificationSettings: (albumId: string) =>
      `/album/${albumId}/notification-settings`,
    // Photosrr
    photos: (albumId: string) => `/album/${albumId}/photos`,
    uploadPhoto: (albumId: string) => `/album/${albumId}/photos`,
    deletePhoto: (albumId: string, photoId: string) =>
      `/album/${albumId}/photos/${photoId}`,
    photoLike: (albumId: string, photoId: string) =>
      `/album/${albumId}/photos/${photoId}/like`,
    photoComments: (albumId: string, photoId: string) =>
      `/album/${albumId}/photos/${photoId}/comments`,
    photoComment: (albumId: string, photoId: string, commentId: string) =>
      `/album/${albumId}/photos/${photoId}/comments/${commentId}`,
    photoTags: (albumId: string, photoId: string) =>
      `/album/${albumId}/photos/${photoId}/tags`,
    photoTag: (albumId: string, photoId: string, tag: string) =>
      `/album/${albumId}/photos/${photoId}/tags/${encodeURIComponent(tag)}`,
    albumPhotoTags: (albumId: string) => `/album/${albumId}/photo-tags`,
    // Moments (daily drops / challenges)
    moments: {
      list: (albumId: string) => `/album/${albumId}/moments`,
      create: (albumId: string) => `/album/${albumId}/moments`,
      get: (albumId: string, momentId: string) =>
        `/album/${albumId}/moments/${momentId}`,
      cancel: (albumId: string, momentId: string) =>
        `/album/${albumId}/moments/${momentId}`,
      submissions: (albumId: string, momentId: string, eventId: string) =>
        `/album/${albumId}/moments/${momentId}/events/${eventId}/submissions`,
    },
    page: {
      create: (albumId: string) => `/album/${albumId}/page`,
      get: (albumId: string) => `/album/${albumId}/page`,
      update: (albumId: string, pageId: string) =>
        `/album/${albumId}/page/${pageId}`,
      webPassword: (albumId: string, pageId: string) =>
        `/album/${albumId}/page/${pageId}/web-password`,
      posts: {
        list: (albumId: string, pageId: string) =>
          `/album/${albumId}/page/${pageId}/posts`,
        create: (albumId: string, pageId: string) =>
          `/album/${albumId}/page/${pageId}/posts`,
        like: (albumId: string, pageId: string, postId: string) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/like`,
        unlike: (albumId: string, pageId: string, postId: string) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/like`,
        comments: (albumId: string, pageId: string, postId: string) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/comments`,
        comment: (
          albumId: string,
          pageId: string,
          postId: string,
          commentId: string,
        ) =>
          `/album/${albumId}/page/${pageId}/posts/${postId}/comments/${commentId}`,
      },
    },
  },
  invite: {
    info: (inviteId: string) => `/invite/${inviteId}`,
    accept: (inviteId: string) => `/invite/${inviteId}/accept`,
  },
};

export default endpoints;
