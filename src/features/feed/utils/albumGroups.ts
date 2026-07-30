/**
 * Groups the Albums timeline (a flat, newest-first list of per-actor
 * updates from GET /feed/albums) into one section per album for the
 * editorial Albums view: "Sara, Erik and 1 other added 14 photos".
 *
 * Group order = first appearance in the feed, so the album with the
 * newest activity leads (it gets the hero treatment). Non-photo updates
 * (member joined, moment started) pass through untouched.
 */

import type {
  AlbumFeedUpdate,
  AlbumUpdatePhoto,
  FeedUser,
  MemberJoinedUpdate,
  MomentStartedUpdate,
} from "../types/feed.types";

/** Most thumbnails a group ever renders (hero collage / compact strip). */
const MAX_GROUP_PHOTOS = 4;

export interface AlbumPhotoGroup {
  albumId: string;
  albumTitle: string;
  /** Unique contributors, newest first */
  actors: FeedUser[];
  /** Up to MAX_GROUP_PHOTOS newest photos across the group's updates */
  photos: AlbumUpdatePhoto[];
  /** Total photos added across the group's updates */
  photoCount: number;
  /** Newest update's timestamp */
  latestAt: string;
}

export type OtherAlbumUpdate = MemberJoinedUpdate | MomentStartedUpdate;

export interface GroupedAlbumsFeed {
  groups: AlbumPhotoGroup[];
  others: OtherAlbumUpdate[];
}

export const groupAlbumsFeed = (
  items: AlbumFeedUpdate[],
): GroupedAlbumsFeed => {
  const byAlbum = new Map<string, AlbumPhotoGroup>();
  const groups: AlbumPhotoGroup[] = [];
  const others: OtherAlbumUpdate[] = [];

  for (const item of items) {
    if (item.type !== "photos_added") {
      others.push(item);
      continue;
    }
    let group = byAlbum.get(item.albumId);
    if (!group) {
      group = {
        albumId: item.albumId,
        albumTitle: item.albumTitle,
        actors: [],
        photos: [],
        photoCount: 0,
        latestAt: item.createdAt,
      };
      byAlbum.set(item.albumId, group);
      groups.push(group);
    }
    if (!group.actors.some((a) => a.userId === item.actor.userId)) {
      group.actors.push(item.actor);
    }
    for (const photo of item.photos) {
      if (group.photos.length >= MAX_GROUP_PHOTOS) break;
      if (!group.photos.some((p) => p.photoId === photo.photoId)) {
        group.photos.push(photo);
      }
    }
    group.photoCount += item.photoCount;
  }

  return { groups, others };
};

const firstName = (user: FeedUser) => user.name.trim().split(/\s+/)[0] || "?";

/**
 * "Sara added" / "Sara and Erik added" / "Sara, Erik and 2 others added" —
 * the bolded photo count is appended by the caller.
 */
export const actorsPhrase = (actors: FeedUser[]): string => {
  const names = actors.map(firstName);
  if (names.length === 0) return "Added";
  if (names.length === 1) return `${names[0]} added`;
  if (names.length === 2) return `${names[0]} and ${names[1]} added`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${
    rest === 1 ? "other" : "others"
  } added`;
};
