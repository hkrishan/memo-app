/**
 * Per-album sections for the editorial Albums view. The album with the
 * newest activity gets the hero treatment — bullet title, rounded collage,
 * contributor facepile and a black "View N new" pill with an add ("+")
 * button — and the rest get a compact row: a horizontal thumbnail strip
 * with an underlined "Open" link. Flat editorial layout throughout:
 * hairline dividers between sections, no card surfaces.
 */

import React, { memo, useCallback } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { CachedImage } from "@/components/ui/CachedImage";
import SocialAvatar from "@/features/album/components/photoSocial/SocialAvatar";
import { color, font, radius } from "@/lib/tokens";
import type { AlbumUpdatePhoto, FeedUser } from "../types/feed.types";
import type { AlbumPhotoGroup } from "../utils/albumGroups";
import { actorsPhrase } from "../utils/albumGroups";
import { formatRelativeTime, H_PADDING } from "./FeedCard";
import { PhotoCollage } from "./PhotoCollage";

const { width: SW } = Dimensions.get("window");

const COLLAGE_WIDTH = SW - H_PADDING * 2;
const COLLAGE_SPACING = 6;
/** Square thumbnail edge in the compact strip */
const STRIP_THUMB = 104;

const thumbUri = (p: AlbumUpdatePhoto) => p.thumbnailUrl ?? p.url;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** "• Gotland, july                          2h" */
const TitleRow = memo<{ title: string; createdAt: string }>(
  ({ title, createdAt }) => (
    <View style={styles.titleRow}>
      <View style={styles.bullet} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.time}>{formatRelativeTime(createdAt)}</Text>
    </View>
  ),
);

const Facepile = memo<{ actors: FeedUser[] }>(({ actors }) => (
  <View style={styles.facepile}>
    {actors.slice(0, 3).map((actor, i) => (
      <View
        key={actor.userId}
        style={[styles.faceWrap, i > 0 && styles.faceOverlap]}
      >
        <SocialAvatar
          name={actor.name}
          avatarUrl={actor.avatarUrl}
          size={24}
          surface="light"
        />
      </View>
    ))}
  </View>
));

const ContributorsLine = memo<{ group: AlbumPhotoGroup }>(({ group }) => (
  <Text style={styles.contributors} numberOfLines={1}>
    {actorsPhrase(group.actors)}{" "}
    <Text style={styles.contributorsStrong}>
      {group.photoCount} {group.photoCount === 1 ? "photo" : "photos"}
    </Text>
  </Text>
));

// ---------------------------------------------------------------------------
// Hero — the album with the newest photos
// ---------------------------------------------------------------------------

export const AlbumGroupHero = memo<{ group: AlbumPhotoGroup }>(({ group }) => {
  const router = useRouter();
  const openAlbum = useCallback(
    () => router.push(`/album/${group.albumId}`),
    [router, group.albumId],
  );
  const openAddPhotos = useCallback(
    () => router.push(`/album/${group.albumId}/add-photos`),
    [router, group.albumId],
  );

  // The mockup's hero collage: one large cell + two stacked. Show at most
  // 3 photos and fold the remainder into the "+N" scrim.
  const collagePhotos = group.photos.slice(0, 3);
  const extraCount = Math.max(0, group.photoCount - collagePhotos.length);

  return (
    <View style={styles.section}>
      <TitleRow title={group.albumTitle} createdAt={group.latestAt} />

      <Pressable
        onPress={openAlbum}
        accessibilityRole="button"
        accessibilityLabel={`Open ${group.albumTitle}`}
      >
        <PhotoCollage
          items={collagePhotos.map((p) => ({
            id: p.photoId,
            uri: thumbUri(p),
            isVideo: p.mediaType === "video",
          }))}
          width={COLLAGE_WIDTH}
          spacing={COLLAGE_SPACING}
          extraCount={extraCount}
          cellRadius={radius.md}
        />
      </Pressable>

      <View style={styles.peopleRow}>
        <Facepile actors={group.actors} />
        <ContributorsLine group={group} />
      </View>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={openAlbum}
          style={({ pressed }) => [
            styles.viewButton,
            pressed && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View ${group.photoCount} new photos in ${group.albumTitle}`}
        >
          <Text style={styles.viewButtonLabel}>
            View {group.photoCount} new
          </Text>
        </Pressable>
        <Pressable
          onPress={openAddPhotos}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Add photos to ${group.albumTitle}`}
        >
          <Ionicons name="add" size={24} color={color.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Compact — every other album with new photos
// ---------------------------------------------------------------------------

export const AlbumGroupCompact = memo<{ group: AlbumPhotoGroup }>(
  ({ group }) => {
    const router = useRouter();
    const openAlbum = useCallback(
      () => router.push(`/album/${group.albumId}`),
      [router, group.albumId],
    );

    const extraCount = Math.max(0, group.photoCount - group.photos.length);
    const lastIdx = group.photos.length - 1;

    return (
      <View style={styles.section}>
        <TitleRow title={group.albumTitle} createdAt={group.latestAt} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          // The strip starts at the screen gutter but bleeds to the edge
          style={styles.stripBleed}
        >
          {group.photos.map((photo, i) => (
            <Pressable
              key={photo.photoId}
              onPress={openAlbum}
              style={styles.stripThumb}
              accessibilityRole="button"
              accessibilityLabel={`Open ${group.albumTitle}`}
            >
              <CachedImage
                uri={thumbUri(photo)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              {i === lastIdx && extraCount > 0 && (
                <View style={styles.stripExtraOverlay} pointerEvents="none">
                  <Text style={styles.stripExtraText}>+{extraCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.peopleRow}>
          {group.actors[0] && (
            <View style={styles.faceWrap}>
              <SocialAvatar
                name={group.actors[0].name}
                avatarUrl={group.actors[0].avatarUrl}
                size={24}
                surface="light"
              />
            </View>
          )}
          <ContributorsLine group={group} />
          <Pressable
            onPress={openAlbum}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressedDim]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${group.albumTitle}`}
          >
            <Text style={styles.openLink}>Open</Text>
          </Pressable>
        </View>
      </View>
    );
  },
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 24,
    marginBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  bullet: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color.textPrimary,
    marginRight: 9,
  },
  title: {
    flex: 1,
    color: color.textPrimary,
    fontSize: 18,
    ...font.bold,
  },
  time: {
    color: color.textTertiary,
    fontSize: 13,
    ...font.regular,
    fontVariant: ["tabular-nums"],
    marginLeft: 12,
  },
  peopleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  facepile: {
    flexDirection: "row",
  },
  faceWrap: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: color.bg,
    marginRight: 8,
  },
  faceOverlap: {
    marginLeft: -14,
  },
  contributors: {
    flex: 1,
    color: color.textSecondary,
    fontSize: 14,
    ...font.regular,
  },
  contributorsStrong: {
    color: color.textPrimary,
    ...font.semibold,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  viewButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonLabel: {
    color: color.textInverse,
    fontSize: 16,
    ...font.semibold,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressedDim: {
    opacity: 0.6,
  },
  stripBleed: {
    marginHorizontal: -H_PADDING,
  },
  strip: {
    paddingHorizontal: H_PADDING,
    gap: 8,
  },
  stripThumb: {
    width: STRIP_THUMB,
    height: STRIP_THUMB,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#ececee",
  },
  stripExtraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  stripExtraText: {
    color: "#fff",
    fontSize: 16,
    ...font.bold,
  },
  openLink: {
    color: color.textPrimary,
    fontSize: 15,
    ...font.semibold,
    textDecorationLine: "underline",
    marginLeft: 12,
  },
});
