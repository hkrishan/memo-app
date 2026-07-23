export const queryKeys = {
  user: {
    profile: ["user", "me"],
  },
  feed: {
    list: ["feed"],
    // Deliberately NOT under the ["feed"] prefix: the post-like mutation
    // invalidates/cancels queryKeys.feed.list by prefix, and the albums
    // timeline must not be dragged into a refetch on every heart toggle
    albums: ["feedAlbums"],
  },
};
