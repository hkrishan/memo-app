import React, { memo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import type { AlbumActivityFeedItem, FeedPhoto } from "../types/feed.types";
import { FeedCard, FeedCardHeader, MEDIA_WIDTH, H_PADDING } from "./FeedCard";
import { FeedMediaViewer } from "./FeedMediaViewer";
import { PhotoCollage } from "./PhotoCollage";

const thumbUri = (p: FeedPhoto) => p.thumbnailUrl ?? p.url;

// ---------------------------------------------------------------------------
// AlbumActivityCard — "X added N photos" items in the main (Pages) feed.
// The collage itself is shared with the Albums timeline (PhotoCollage).
// ---------------------------------------------------------------------------

interface AlbumActivityCardProps {
  item: AlbumActivityFeedItem;
}

const AlbumActivityCard = memo<AlbumActivityCardProps>(({ item }) => {
  const { activity, album } = item;
  const { user, photos, photoCount } = activity;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const actionText =
    photoCount === 1 ? "added a photo" : `added ${photoCount} photos`;

  return (
    <FeedCard>
      {/* Eyebrow: distinguishes album activity from page posts at a glance */}
      <View style={styles.eyebrow}>
        <Ionicons name="images-outline" size={12} color="#8e8e93" />
        <Text style={styles.eyebrowText}>Album update</Text>
      </View>

      <FeedCardHeader
        avatarName={user.name}
        avatarUrl={user.avatarUrl}
        title={
          <>
            {user.name}
            <Text style={styles.actionLabel}> {actionText}</Text>
          </>
        }
        subtitle={album.title}
        createdAt={activity.createdAt}
      />

      {/* Full-bleed photo collage (max 4 visible, +N overlay on the last) */}
      <PhotoCollage
        items={photos.map((p) => ({ id: p.photoId, uri: thumbUri(p) }))}
        width={MEDIA_WIDTH}
        onPressItem={setViewerIndex}
      />

      {/* Fullscreen viewer over ALL the activity's photos */}
      <FeedMediaViewer
        images={photos.map((p) => ({ uri: p.url }))}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex != null}
        onClose={() => setViewerIndex(null)}
      />
    </FeedCard>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: H_PADDING,
    marginBottom: 8,
  },
  eyebrowText: {
    color: "#8e8e93",
    fontSize: 11,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  actionLabel: {
    color: "#9a9aa0",
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
  },
});

export default AlbumActivityCard;
