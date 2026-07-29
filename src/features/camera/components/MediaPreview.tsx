/**
 * MediaPreview Component
 * Full-screen preview of captured photos and videos with album selection
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Dimensions,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SlideInDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { Text } from "react-native-paper";

import { MediaPreviewProps } from "../types";
import { CAMERA_UI_CONFIG } from "../constants";
import { useGetAlbumsQuery } from "@/features/album/api/album.queries";
import { Album } from "@/features/album/types/album.types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TIMING_CONFIG = {
  duration: 100,
  easing: Easing.out(Easing.quad),
};

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  variant = "default",
  disabled = false,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.9, TIMING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, TIMING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getBackgroundColor = () => {
    if (disabled) return "rgba(255, 255, 255, 0.1)";
    switch (variant) {
      case "primary":
        return "rgba(0, 150, 255, 0.9)";
      case "danger":
        return "rgba(255, 59, 48, 0.9)";
      default:
        return "rgba(255, 255, 255, 0.2)";
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.actionButtonContainer, animatedStyle]}
      disabled={disabled}
    >
      <View
        style={[styles.actionButton, { backgroundColor: getBackgroundColor() }]}
      >
        <Ionicons
          name={icon}
          size={24}
          color={
            disabled ? "rgba(255,255,255,0.3)" : CAMERA_UI_CONFIG.COLORS.TEXT
          }
        />
      </View>
      <Text
        style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
};

interface AlbumItemProps {
  album: Album;
  isSelected: boolean;
  onPress: () => void;
}

const AlbumItem: React.FC<AlbumItemProps> = ({
  album,
  isSelected,
  onPress,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.95, TIMING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, TIMING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.albumItem, animatedStyle]}
    >
      <View
        style={[styles.albumCover, isSelected && styles.albumCoverSelected]}
      >
        {isSelected ? (
          <Ionicons name="checkmark" size={28} color="#fff" />
        ) : (
          <Ionicons
            name="images-outline"
            size={24}
            color="rgba(255,255,255,0.7)"
          />
        )}
      </View>
      <Text
        style={[styles.albumTitle, isSelected && styles.albumTitleSelected]}
        numberOfLines={1}
      >
        {album.title}
      </Text>
    </AnimatedPressable>
  );
};

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  media,
  onClose,
  onSave,
  onDelete,
  visible,
  isUploading = false,
  lockedAlbumId,
}) => {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const { data: albums } = useGetAlbumsQuery();

  // Determine if this is a photo or video
  const isPhoto = media
    ? "width" in media && "height" in media && !("duration" in media)
    : true;
  const uri = media ? `file://${media.path}` : "";

  // Auto-play video when visible
  useEffect(() => {
    if (visible && !isPhoto && videoRef.current) {
      videoRef.current.playAsync();
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.stopAsync();
      }
    };
  }, [visible, isPhoto]);

  // Reset selection when media changes
  useEffect(() => {
    setSelectedAlbumId(null);
  }, [media]);

  const handleAlbumSelect = useCallback((albumId: string) => {
    setSelectedAlbumId((prev) => (prev === albumId ? null : albumId));
  }, []);

  const handleSaveToAlbum = useCallback(() => {
    if (selectedAlbumId) {
      onSave(selectedAlbumId);
    }
  }, [selectedAlbumId, onSave]);

  // No album argument: the gallery-only save on the main tab, and — in
  // album-capture mode — the save into the camera's own album (the screen
  // forces that destination).
  const handleSaveToGallery = useCallback(() => {
    onSave();
  }, [onSave]);

  if (!visible || !media) {
    return null;
  }

  const lockedTitle = lockedAlbumId
    ? albums?.find((album) => album.albumId === lockedAlbumId)?.title
    : undefined;
  const hasAlbums = !lockedAlbumId && albums && albums.length > 0;

  return (
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
    >
      <StatusBar barStyle="light-content" />

      {isPhoto ? (
        <Image source={{ uri }} style={styles.media} resizeMode="cover" />
      ) : (
        <Video
          ref={videoRef}
          source={{ uri }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay
          isMuted={false}
        />
      )}

      {/* Top bar with close button */}
      <Animated.View
        style={[styles.topBar, { paddingTop: insets.top + 10 }]}
        entering={FadeIn.delay(50).duration(150)}
      >
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons
            name="close"
            size={32}
            color={CAMERA_UI_CONFIG.COLORS.TEXT}
          />
        </Pressable>
      </Animated.View>

      {/* Bottom section */}
      <Animated.View
        style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}
        entering={SlideInDown.delay(50).duration(200)}
      >
        {/* Album carousel */}
        {hasAlbums && (
          <View style={styles.albumSection}>
            <Text style={styles.sectionTitle}>Save to Album</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumList}
            >
              {albums.map((album) => (
                <AlbumItem
                  key={album.albumId}
                  album={album}
                  isSelected={selectedAlbumId === album.albumId}
                  onPress={() => handleAlbumSelect(album.albumId)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionBar}>
          <ActionButton
            icon="trash-outline"
            label="Delete"
            onPress={onDelete}
            variant="danger"
            disabled={isUploading}
          />

          {lockedAlbumId ? (
            // Album camera: one destination, one button
            <ActionButton
              icon={isUploading ? "hourglass-outline" : "checkmark-circle-outline"}
              label={isUploading ? "Saving…" : (lockedTitle ?? "Save")}
              onPress={handleSaveToGallery}
              variant="primary"
              disabled={isUploading}
            />
          ) : (
            <>
              <ActionButton
                icon="download-outline"
                label="Gallery"
                onPress={handleSaveToGallery}
                disabled={isUploading}
              />

              {hasAlbums && (
                <ActionButton
                  icon={
                    isUploading ? "hourglass-outline" : "checkmark-circle-outline"
                  }
                  label={isUploading ? "Saving…" : "Save"}
                  onPress={handleSaveToAlbum}
                  variant={selectedAlbumId ? "primary" : "default"}
                  disabled={!selectedAlbumId || isUploading}
                />
              )}
            </>
          )}
        </View>
      </Animated.View>

      {/* Save overlay — the upload itself continues in the background */}
      {isUploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadText}>Saving...</Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 100,
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  albumSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    marginLeft: 20,
    marginBottom: 12,
    opacity: 0.8,
  },
  albumList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  albumItem: {
    alignItems: "center",
    width: 72,
  },
  albumCover: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  albumCoverSelected: {
    backgroundColor: "rgba(0, 150, 255, 0.6)",
    borderColor: "#0096FF",
  },
  albumTitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
  albumTitleSelected: {
    color: "#fff",
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  actionButtonContainer: {
    alignItems: "center",
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    marginTop: 6,
    opacity: 0.9,
  },
  actionLabelDisabled: {
    opacity: 0.3,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  uploadText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
  },
});

export default MediaPreview;
