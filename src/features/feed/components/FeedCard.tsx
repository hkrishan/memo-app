/**
 * Shared building blocks for feed items: section wrapper, header, avatar,
 * and relative-time formatting. Media is rendered full-bleed (screen-wide)
 * by the item components; text rows indent with H_PADDING.
 *
 * Page posts get a gradient-ringed avatar (the page identity colors);
 * album activity uses the plain avatar.
 */

import React, { memo } from "react";
import { View, StyleSheet, Dimensions, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { CachedImage } from "@/components/ui/CachedImage";

const { width: SW } = Dimensions.get("window");

/** Horizontal indent for text rows (media itself is edge-to-edge) */
export const H_PADDING = 16;
/** Media spans the full screen width */
export const MEDIA_WIDTH = SW;

// One relative-time format app-wide — imported for local use AND
// re-exported so existing feed imports keep working
import { formatRelativeTime } from "@/features/album/components/photoSocial/socialUtils";
export { formatRelativeTime };

const AVATAR_SIZE = 36;
/** Page avatars: same rounded-square shape as the page-profile cover. */
const PAGE_AVATAR_RADIUS = 10;

export const FeedAvatar = memo<{
  name: string;
  avatarUrl: string | null;
  /**
   * Page identity — a rounded square (the page-profile cover shape with a
   * hairline edge) instead of a person's circle.
   */
  page?: boolean;
}>(({ name, avatarUrl, page }) => {
  const radius = page ? PAGE_AVATAR_RADIUS : AVATAR_SIZE / 2;
  return (
    <View style={[styles.avatarCore, { borderRadius: radius }]}>
      {avatarUrl ? (
        <CachedImage
          uri={avatarUrl}
          style={styles.avatarImage}
          showPlaceholder={false}
        />
      ) : (
        <Text style={styles.avatarInitial}>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      )}
      {page && (
        <View
          style={[styles.avatarEdge, { borderRadius: radius }]}
          pointerEvents="none"
        />
      )}
    </View>
  );
});

interface FeedCardHeaderProps {
  avatarName: string;
  avatarUrl: string | null;
  /** Main line; a plain name or a rich fragment (e.g. "Hugo added 3 photos") */
  title: React.ReactNode;
  subtitle: string;
  createdAt: string;
  /** Page identity — rounded-square avatar (page posts) */
  page?: boolean;
  /** Makes the whole header row a tap target (no visual button chrome) */
  onPress?: () => void;
  /** Trailing slot (e.g. an overflow menu); its own presses don't bubble
   *  into onPress. */
  rightAccessory?: React.ReactNode;
}

export const FeedCardHeader = memo<FeedCardHeaderProps>(
  ({
    avatarName,
    avatarUrl,
    title,
    subtitle,
    createdAt,
    page,
    onPress,
    rightAccessory,
  }) => {
    const content = (
      <>
        <FeedAvatar name={avatarName} avatarUrl={avatarUrl} page={page} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
            <Text style={styles.headerDot}>{"  ·  "}</Text>
            <Text style={styles.headerTime}>
              {formatRelativeTime(createdAt)}
            </Text>
          </Text>
        </View>
        {rightAccessory}
      </>
    );

    if (onPress) {
      return (
        <Pressable
          style={styles.header}
          onPress={onPress}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
        >
          {content}
        </Pressable>
      );
    }

    return <View style={styles.header}>{content}</View>;
  },
);

export const FeedCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <View style={styles.section}>{children}</View>;

const styles = StyleSheet.create({
  section: {
    // Editorial separation: a full-bleed hairline instead of pure
    // whitespace between posts
    paddingBottom: 24,
    marginBottom: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.08)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: H_PADDING,
  },
  avatarCore: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    overflow: "hidden",
    backgroundColor: "#F1F1F3",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarInitial: {
    color: "rgba(0, 0, 0, 0.6)",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  avatarEdge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    color: "#111",
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  headerSubtitle: {
    color: "#8e8e93",
    fontSize: 12.5,
    marginTop: 1,
  },
  headerDot: {
    color: "#c7c7cc",
  },
  headerTime: {
    color: "#8e8e93",
  },
});
