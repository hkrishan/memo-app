import React, { memo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { CachedImage } from "@/components/ui/CachedImage";
import type { AlbumActivityFeedItem, FeedPhoto } from "../types/feed.types";

const { width: SW } = Dimensions.get("window");
const CARD_PADDING = 20;
const GRID_SPACING = 2;
const GRID_WIDTH = SW - CARD_PADDING * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  const diffMs = now - t;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Photo grid (max 4 visible, +N overlay)
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 4;

const PhotoGrid = memo<{ photos: FeedPhoto[] }>(({ photos }) => {
  const count = photos.length;
  const visible = photos.slice(0, MAX_VISIBLE);
  const extra = count - MAX_VISIBLE;

  // Single photo
  if (count === 1) {
    return (
      <View
        style={[styles.gridContainer, { borderRadius: 12, overflow: "hidden" }]}
      >
        <CachedImage
          uri={visible[0].url}
          style={{ width: GRID_WIDTH, aspectRatio: 1 }}
          contentFit="cover"
        />
      </View>
    );
  }

  // 2 photos — side by side
  if (count === 2) {
    const cellW = (GRID_WIDTH - GRID_SPACING) / 2;
    return (
      <View style={[styles.gridContainer, styles.gridRow]}>
        {visible.map((p) => (
          <View
            key={p.photoId}
            style={[styles.gridCell, { width: cellW, height: cellW }]}
          >
            <CachedImage
              uri={p.url}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          </View>
        ))}
      </View>
    );
  }

  // 3 photos — one large left, two stacked right
  if (count === 3) {
    const bigW = (GRID_WIDTH - GRID_SPACING) * 0.6;
    const smallW = GRID_WIDTH - bigW - GRID_SPACING;
    const bigH = smallW * 2 + GRID_SPACING;
    return (
      <View style={[styles.gridContainer, styles.gridRow]}>
        <View style={[styles.gridCell, { width: bigW, height: bigH }]}>
          <CachedImage
            uri={visible[0].url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </View>
        <View style={{ gap: GRID_SPACING }}>
          {visible.slice(1).map((p) => (
            <View
              key={p.photoId}
              style={[styles.gridCell, { width: smallW, height: smallW }]}
            >
              <CachedImage
                uri={p.url}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // 4+ photos — 2x2 grid
  const cellW = (GRID_WIDTH - GRID_SPACING) / 2;
  return (
    <View style={styles.gridContainer}>
      <View style={[styles.gridRow, { marginBottom: GRID_SPACING }]}>
        <View style={[styles.gridCell, { width: cellW, height: cellW }]}>
          <CachedImage
            uri={visible[0].url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </View>
        <View style={[styles.gridCell, { width: cellW, height: cellW }]}>
          <CachedImage
            uri={visible[1].url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </View>
      </View>
      <View style={styles.gridRow}>
        <View style={[styles.gridCell, { width: cellW, height: cellW }]}>
          <CachedImage
            uri={visible[2].url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </View>
        <View style={[styles.gridCell, { width: cellW, height: cellW }]}>
          <CachedImage
            uri={visible[3].url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          {extra > 0 && (
            <View style={styles.extraOverlay}>
              <Text style={styles.extraText}>+{extra}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// AlbumActivityCard
// ---------------------------------------------------------------------------

interface AlbumActivityCardProps {
  item: AlbumActivityFeedItem;
}

const AlbumActivityCard = memo<AlbumActivityCardProps>(({ item }) => {
  const { activity, album } = item;
  const { user, photos, photoCount } = activity;

  const actionText =
    photoCount === 1 ? "added 1 photo" : `added ${photoCount} photos`;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {user.avatarUrl ? (
            <CachedImage
              uri={user.avatarUrl}
              style={styles.avatar}
              showPlaceholder={false}
            />
          ) : null}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerLine}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.actionLabel}> {actionText}</Text>
          </Text>
          <Text style={styles.albumName}>{album.title}</Text>
        </View>
        <Text style={styles.timestamp}>
          {formatRelativeTime(activity.createdAt)}
        </Text>
      </View>

      {/* Photo grid */}
      <PhotoGrid photos={photos} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  avatar: {
    width: 36,
    height: 36,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  headerLine: {
    fontSize: 14,
  },
  userName: {
    color: "#fff",
    fontWeight: "600",
  },
  actionLabel: {
    color: "#aaa",
  },
  albumName: {
    color: "#888",
    fontSize: 12,
    marginTop: 1,
  },
  timestamp: {
    color: "#666",
    fontSize: 12,
  },
  gridContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gridRow: {
    flexDirection: "row",
    gap: GRID_SPACING,
  },
  gridCell: {
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  extraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  extraText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
});

export default AlbumActivityCard;
