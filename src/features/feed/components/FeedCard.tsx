/**
 * Shared building blocks for feed items: section wrapper, header, avatar,
 * and relative-time formatting. Media is rendered full-bleed (screen-wide)
 * by the item components; text rows indent with H_PADDING.
 *
 * Page posts get a gradient-ringed avatar (the page identity colors);
 * album activity uses the plain avatar.
 */

import React, { memo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { CachedImage } from "@/components/ui/CachedImage";

const { width: SW } = Dimensions.get("window");

/** Horizontal indent for text rows (media itself is edge-to-edge) */
export const H_PADDING = 16;
/** Media spans the full screen width */
export const MEDIA_WIDTH = SW;

/** Same gradient as the public page profile ring */
export const PAGE_RING_COLORS = [
  "#ff00b7ff",
  "#495bffff",
  "#9b69ffff",
] as const;

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  const diffMs = now - t;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const AVATAR_SIZE = 36;

const AvatarCore = memo<{ name: string; avatarUrl: string | null; size: number }>(
  ({ name, avatarUrl, size }) => (
    <View
      style={[
        styles.avatarCore,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {avatarUrl ? (
        <CachedImage
          uri={avatarUrl}
          style={{ width: size, height: size }}
          showPlaceholder={false}
        />
      ) : (
        <Text style={styles.avatarInitial}>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      )}
    </View>
  ),
);

export const FeedAvatar = memo<{
  name: string;
  avatarUrl: string | null;
  /** Wrap the avatar in the page-identity gradient ring */
  ring?: boolean;
}>(({ name, avatarUrl, ring }) => {
  if (!ring) {
    return <AvatarCore name={name} avatarUrl={avatarUrl} size={AVATAR_SIZE} />;
  }
  return (
    <LinearGradient
      colors={[...PAGE_RING_COLORS]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.ringOuter}
    >
      <View style={styles.ringInner}>
        <AvatarCore name={name} avatarUrl={avatarUrl} size={AVATAR_SIZE - 6} />
      </View>
    </LinearGradient>
  );
});

interface FeedCardHeaderProps {
  avatarName: string;
  avatarUrl: string | null;
  /** Main line; a plain name or a rich fragment (e.g. "Hugo added 3 photos") */
  title: React.ReactNode;
  subtitle: string;
  createdAt: string;
  /** Page-identity gradient ring around the avatar (page posts) */
  ring?: boolean;
}

export const FeedCardHeader = memo<FeedCardHeaderProps>(
  ({ avatarName, avatarUrl, title, subtitle, createdAt, ring }) => (
    <View style={styles.header}>
      <FeedAvatar name={avatarName} avatarUrl={avatarUrl} ring={ring} />
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle}
          <Text style={styles.headerDot}>{"  ·  "}</Text>
          <Text style={styles.headerTime}>{formatRelativeTime(createdAt)}</Text>
        </Text>
      </View>
    </View>
  ),
);

export const FeedCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <View style={styles.section}>{children}</View>;

const styles = StyleSheet.create({
  section: {
    marginBottom: 56,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: H_PADDING,
  },
  avatarCore: {
    overflow: "hidden",
    backgroundColor: "#3a3a3c",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 15,
    fontWeight: "600",
  },
  ringOuter: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 14.5,
    fontWeight: "600",
  },
  headerSubtitle: {
    color: "#9a9aa0",
    fontSize: 12.5,
    marginTop: 1,
  },
  headerDot: {
    color: "#5a5a5e",
  },
  headerTime: {
    color: "#77777c",
  },
});
