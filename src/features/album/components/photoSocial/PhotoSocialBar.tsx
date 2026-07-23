/**
 * PhotoSocialBar — floating row of dark translucent pill buttons rendered
 * inside the fullscreen photo viewer: like (heart + count), comments
 * (bubble + count), and tags (pricetag icon + tag count).
 * Like toggles optimistically via the mutation hook, with a light haptic
 * and a springy heart "pop".
 */

import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { useTogglePhotoLikeMutation } from "@/features/album/api/photo.queries";
import { PhotoSocial } from "./photoSocial.types";
import { formatCompactCount } from "./socialUtils";

const LIKED_COLOR = "#FF3B5C";

export type PhotoSocialBarProps = {
  albumId: string;
  photoId: string;
  social: PhotoSocial | undefined;
  onOpenComments: () => void;
  onOpenTags: () => void;
  /**
   * Delete affordance — pass ONLY when the current user may delete this
   * photo (its uploader or the album owner); undefined hides the pill.
   */
  onDelete?: () => void;
  /**
   * Report affordance — pass ONLY for photos NOT uploaded by the current
   * user; undefined hides the pill.
   */
  onReport?: () => void;
};

export const PhotoSocialBar: React.FC<PhotoSocialBarProps> = ({
  albumId,
  photoId,
  social,
  onOpenComments,
  onOpenTags,
  onDelete,
  onReport,
}) => {
  const toggleLike = useTogglePhotoLikeMutation(albumId);
  const heartScale = useSharedValue(1);

  const liked = social?.likedByMe ?? false;
  const likeCount = social?.likeCount ?? 0;
  const commentCount = social?.commentCount ?? 0;
  const tags = social?.tags ?? [];

  const handleLikePress = useCallback(() => {
    if (!social) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    heartScale.value = withSequence(
      withSpring(1.35, { damping: 12, stiffness: 420 }),
      withSpring(1, { damping: 14, stiffness: 320 }),
    );
    toggleLike.mutate({ photoId, like: !social.likedByMe });
  }, [social, photoId, toggleLike, heartScale]);

  const handleCommentsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenComments();
  }, [onOpenComments]);

  const handleTagsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenTags();
  }, [onOpenTags]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {/* Like */}
      <Pressable
        onPress={handleLikePress}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={liked ? "Unlike photo" : "Like photo"}
        accessibilityState={{ selected: liked }}
      >
        <Animated.View style={heartStyle}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={20}
            color={liked ? LIKED_COLOR : "#fff"}
          />
        </Animated.View>
        {likeCount > 0 && (
          <Text style={styles.count}>{formatCompactCount(likeCount)}</Text>
        )}
      </Pressable>

      {/* Comments */}
      <Pressable
        onPress={handleCommentsPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Comments, ${commentCount}`}
      >
        <Ionicons name="chatbubble-outline" size={19} color="#fff" />
        {commentCount > 0 && (
          <Text style={styles.count}>{formatCompactCount(commentCount)}</Text>
        )}
      </Pressable>

      {/* Tags */}
      <Pressable
        onPress={handleTagsPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={
          tags.length > 0 ? `Tags, ${tags.length}` : "Add tags"
        }
      >
        <Ionicons name="pricetag-outline" size={18} color="#fff" />
        {tags.length > 0 && (
          <Text style={styles.count}>{formatCompactCount(tags.length)}</Text>
        )}
      </Pressable>

      {/* Report (other people's photos only) */}
      {onReport != null && (
        <Pressable
          onPress={onReport}
          style={({ pressed }) => [
            styles.pill,
            styles.reportPill,
            pressed && styles.pillPressed,
          ]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Report photo"
        >
          <Ionicons name="flag-outline" size={18} color="#fff" />
        </Pressable>
      )}

      {/* Delete (uploader / album owner only) */}
      {onDelete != null && (
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [
            styles.pill,
            styles.deletePill,
            pressed && styles.pillPressed,
          ]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Delete photo"
        >
          <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 38,
  },
  pillPressed: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  // Slightly set apart from the social pills — destructive, icon-only
  deletePill: {
    marginLeft: 6,
    paddingHorizontal: 11,
  },
  // Same set-apart treatment as delete — moderation, icon-only
  reportPill: {
    marginLeft: 6,
    paddingHorizontal: 11,
  },
  count: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default PhotoSocialBar;
