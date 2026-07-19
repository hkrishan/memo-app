/**
 * AlbumHeader Component
 * Optimized album cover with minimal animations
 */

import React, { memo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Button, IconButton, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  SharedValue,
  interpolate,
  useAnimatedStyle,
  Extrapolation,
} from "react-native-reanimated";
import { Album } from "../types/album.types";
import { CachedImage } from "@/components/ui/CachedImage";
import AvatarListRow from "@/components/ui/AvatarListRow";
import { theme } from "@/lib/theme";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const NAV_BAR_HEIGHT = 56;
export const HEADER_HEIGHT = SCREEN_WIDTH;
export const HEADER_MIN_HEIGHT = 0;

interface AlbumHeaderProps {
  album: Album | undefined;
  scrollY: SharedValue<number>;
}

export const AlbumHeader: React.FC<AlbumHeaderProps> = memo(
  ({ album, scrollY }) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const topOffset = NAV_BAR_HEIGHT + insets.top;
    const scrollRange = HEADER_HEIGHT - topOffset;

    // Header height
    const headerStyle = useAnimatedStyle(() => {
      "worklet";
      return {
        height: interpolate(
          scrollY.value,
          [0, scrollRange],
          [HEADER_HEIGHT, topOffset],
          Extrapolation.CLAMP,
        ),
      };
    });

    // Image parallax
    const imageStyle = useAnimatedStyle(() => {
      "worklet";
      return {
        transform: [
          {
            translateY: interpolate(
              scrollY.value,
              [0, scrollRange],
              [0, -scrollRange * 0.4],
              Extrapolation.CLAMP,
            ),
          },
        ],
      };
    });

    // Content fade
    const contentStyle = useAnimatedStyle(() => {
      "worklet";
      return {
        opacity: interpolate(
          scrollY.value,
          [0, scrollRange * 0.3],
          [1, 0],
          Extrapolation.CLAMP,
        ),
      };
    });

    const handleAddMember = () => {
      router.push(`/album/${album?.albumId}/add-members`);
    };

    const coverUrl = album?.coverPhoto?.url ?? album?.recentPhotos?.[0]?.url;

    return (
      <Animated.View style={[styles.container, headerStyle]}>
        <Animated.View style={[styles.imageContainer, imageStyle]}>
          {coverUrl ? (
            <CachedImage uri={coverUrl} style={styles.coverImage} />
          ) : (
            <View style={styles.placeholder} />
          )}
          <View style={styles.overlay} />
        </Animated.View>

        <Animated.View style={[styles.content, contentStyle]}>
          <Text style={styles.title} numberOfLines={2}>
            {album?.title ?? "Album"}
          </Text>
          {album?.members && album.members.length > 0 && (
            <View style={styles.membersRow}>
              <AvatarListRow
                avatars={album.members}
                maxAvatars={4}
                avatarSize={28}
                gap={-6}
              />
              <Text style={styles.membersText}>
                {album.members.length}{" "}
                {album.members.length === 1 ? "member" : "members"}
              </Text>
              <IconButton
                icon="plus"
                size={15}
                iconColor="black"
                style={{
                  backgroundColor: theme.colors.background,
                }}
                onPress={handleAddMember}
              />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    height: HEADER_HEIGHT * 1.2,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    backgroundColor: "#333",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  content: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  membersText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
  },
});

export default AlbumHeader;
