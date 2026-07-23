/**
 * Cards for the Albums timeline (GET /feed/albums): rich "photos added"
 * cards with a rounded collage, compact "member joined" rows, and accent-
 * badged "moment started" cards that mirror the moment registry's colors.
 * All variants share one dark surface (radius 16, hairline) and navigate
 * into the album on tap.
 */

import React, { memo, useCallback } from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { momentTypeRegistry } from "@/features/moments/registry/momentTypes";
import type {
  AlbumFeedUpdate,
  AlbumUpdatePhoto,
  MemberJoinedUpdate,
  MomentStartedUpdate,
  PhotosAddedUpdate,
} from "../types/feed.types";
import { FeedAvatar, H_PADDING, formatRelativeTime } from "./FeedCard";
import { PhotoCollage } from "./PhotoCollage";

const { width: SW } = Dimensions.get("window");

const CARD_PADDING = 12;
/** Collage width inside an inset card */
const COLLAGE_WIDTH = SW - H_PADDING * 2 - CARD_PADDING * 2;
const COLLAGE_SPACING = 3;

const thumbUri = (p: AlbumUpdatePhoto) => p.thumbnailUrl ?? p.url;

// ---------------------------------------------------------------------------
// Shared surface
// ---------------------------------------------------------------------------

const Surface: React.FC<{
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}> = ({ onPress, accessibilityLabel, children }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [styles.surface, pressed && styles.surfacePressed]}
  >
    {children}
  </Pressable>
);

const AlbumChip = memo<{ title: string }>(({ title }) => (
  <View style={styles.albumChip}>
    <Ionicons name="images-outline" size={10} color="#c7c7cc" />
    <Text style={styles.albumChipText} numberOfLines={1}>
      {title}
    </Text>
  </View>
));

const TimeStamp = memo<{ createdAt: string }>(({ createdAt }) => (
  <Text style={styles.time}>{formatRelativeTime(createdAt)}</Text>
));

// ---------------------------------------------------------------------------
// photos_added — header + rounded thumbnail collage
// ---------------------------------------------------------------------------

const PhotosAddedCard = memo<{ update: PhotosAddedUpdate }>(({ update }) => {
  const router = useRouter();
  const { actor, photos, photoCount, albumTitle, albumId } = update;

  const openAlbum = useCallback(
    () => router.push(`/album/${albumId}`),
    [router, albumId],
  );

  const actionText =
    photoCount === 1 ? "added a photo" : `added ${photoCount} photos`;

  return (
    <Surface
      onPress={openAlbum}
      accessibilityLabel={`${actor.name} ${actionText} to ${albumTitle}`}
    >
      <View style={styles.headerRow}>
        <FeedAvatar name={actor.name} avatarUrl={actor.avatarUrl} />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={styles.name}>{actor.name}</Text> {actionText}
          </Text>
          <View style={styles.metaRow}>
            <AlbumChip title={albumTitle} />
            <TimeStamp createdAt={update.createdAt} />
          </View>
        </View>
      </View>

      {photos.length > 0 && (
        <View style={styles.collageClip}>
          <PhotoCollage
            items={photos.map((p) => ({
              id: p.photoId,
              uri: thumbUri(p),
              isVideo: p.mediaType === "video",
            }))}
            width={COLLAGE_WIDTH}
            spacing={COLLAGE_SPACING}
            extraCount={Math.max(0, photoCount - photos.length)}
            onPressItem={openAlbum}
          />
        </View>
      )}
    </Surface>
  );
});

// ---------------------------------------------------------------------------
// member_joined — compact row with a small green join badge on the avatar
// ---------------------------------------------------------------------------

const MemberJoinedRow = memo<{ update: MemberJoinedUpdate }>(({ update }) => {
  const router = useRouter();
  const { actor, albumTitle, albumId } = update;

  const openAlbum = useCallback(
    () => router.push(`/album/${albumId}`),
    [router, albumId],
  );

  return (
    <Surface
      onPress={openAlbum}
      accessibilityLabel={`${actor.name} joined ${albumTitle}`}
    >
      <View style={styles.headerRow}>
        <View>
          <FeedAvatar name={actor.name} avatarUrl={actor.avatarUrl} />
          <View style={styles.joinBadge}>
            <Ionicons name="person-add" size={8} color="#fff" />
          </View>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            <Text style={styles.name}>{actor.name}</Text> joined{" "}
            <Text style={styles.name}>{albumTitle}</Text>
          </Text>
        </View>
        <TimeStamp createdAt={update.createdAt} />
      </View>
    </Surface>
  );
});

// ---------------------------------------------------------------------------
// moment_started — accent icon badge from the moment type registry
// ---------------------------------------------------------------------------

const MomentStartedCard = memo<{ update: MomentStartedUpdate }>(
  ({ update }) => {
    const router = useRouter();
    const { actor, albumTitle, albumId, moment } = update;
    const def = momentTypeRegistry[moment.momentType];

    // Moments live on the album's third tab
    const openMoments = useCallback(
      () => router.push(`/album/${albumId}?initialTab=2`),
      [router, albumId],
    );

    return (
      <Surface
        onPress={openMoments}
        accessibilityLabel={`${actor.name} started a ${def.displayName} in ${albumTitle}`}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.momentBadge,
              { backgroundColor: `${def.accentColor}29` },
            ]}
          >
            <Ionicons name={def.icon} size={17} color={def.accentColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              <Text style={styles.name}>{actor.name}</Text> started a{" "}
              <Text style={[styles.name, { color: def.accentColor }]}>
                {def.displayName}
              </Text>
            </Text>
            <View style={styles.metaRow}>
              <AlbumChip title={albumTitle} />
              <TimeStamp createdAt={update.createdAt} />
            </View>
          </View>
        </View>
        {!!moment.title && (
          <View
            style={[
              styles.momentTitleWrap,
              { borderLeftColor: def.accentColor },
            ]}
          >
            <Text style={styles.momentTitle} numberOfLines={2}>
              {moment.title}
            </Text>
          </View>
        )}
      </Surface>
    );
  },
);

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const AlbumUpdateCard = memo<{ update: AlbumFeedUpdate }>(({ update }) => {
  switch (update.type) {
    case "photos_added":
      return <PhotosAddedCard update={update} />;
    case "member_joined":
      return <MemberJoinedRow update={update} />;
    case "moment_started":
      return <MomentStartedCard update={update} />;
  }
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  surface: {
    backgroundColor: "#212123",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: CARD_PADDING,
    marginHorizontal: H_PADDING,
    marginBottom: 12,
  },
  surfacePressed: {
    backgroundColor: "#28282b",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    color: "#c9c9ce",
    fontSize: 14.5,
    lineHeight: 19,
  },
  name: {
    color: "#fff",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  albumChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    maxWidth: 200,
  },
  albumChipText: {
    color: "#c7c7cc",
    fontSize: 11.5,
    fontWeight: "500",
  },
  time: {
    color: "#77777c",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  joinBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#30B15C",
    borderWidth: 2,
    borderColor: "#212123",
    alignItems: "center",
    justifyContent: "center",
  },
  momentBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  momentTitleWrap: {
    marginTop: 10,
    marginLeft: 4,
    borderLeftWidth: 2,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  momentTitle: {
    color: "#e8e8ea",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
  collageClip: {
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
  },
});

export default AlbumUpdateCard;
