/**
 * AlbumHeader Component
 * Compact profile-style header above the photo grid: album picture
 * (owner can change it; defaults to the latest photo), title, and members.
 * Scrolls away with the grid — no collapsing cover.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Album } from "../types/album.types";
import { MediaAsset } from "../hooks";
import { CachedImage } from "@/components/ui/CachedImage";
import AvatarListRow from "@/components/ui/AvatarListRow";
import { GlassCircleButton } from "@/components/ui/GlassCircleButton";
import useUser from "@/features/user/hooks/useUser";
import CoverPhotoPicker from "./CoverPhotoPicker";

const PICTURE_SIZE = 84;

interface AlbumHeaderProps {
  album: Album | undefined;
  assets: MediaAsset[];
  /** Height of the nav bar + status bar the header must clear */
  topInset: number;
}

export const AlbumHeader: React.FC<AlbumHeaderProps> = memo(
  ({ album, assets, topInset }) => {
    const router = useRouter();
    const { user } = useUser();
    const [pickerVisible, setPickerVisible] = useState(false);

    const members = album?.members ?? [];
    const isOwner = !!user?.userId && user.userId === album?.ownerId;

    // Chosen picture, otherwise the latest photo
    const pictureUri =
      album?.coverPhoto?.thumbnailUrl ??
      album?.coverPhoto?.url ??
      assets[0]?.thumbnailUrl ??
      assets[0]?.uri;

    const canPickPicture = isOwner && assets.length > 0;

    const memberSummary = useMemo(() => {
      const firstNames = members
        .map((member) => member.name?.split(" ")[0])
        .filter(Boolean);
      if (firstNames.length === 0) return null;
      if (firstNames.length === 1) return firstNames[0];
      if (firstNames.length === 2)
        return `${firstNames[0]} and ${firstNames[1]}`;
      return `${firstNames[0]}, ${firstNames[1]} and ${firstNames.length - 2} more`;
    }, [members]);

    const handleOpenPicker = useCallback(() => {
      if (canPickPicture) setPickerVisible(true);
    }, [canPickPicture]);

    const handleClosePicker = useCallback(() => setPickerVisible(false), []);

    const handleAddMember = useCallback(() => {
      if (album?.albumId) router.push(`/album/${album.albumId}/add-members`);
    }, [router, album?.albumId]);

    const handleOpenMap = useCallback(() => {
      if (album?.albumId) router.push(`/album/${album.albumId}/map`);
    }, [router, album?.albumId]);

    const handleOpenChat = useCallback(() => {
      if (album?.albumId) router.push(`/album/${album.albumId}/chat`);
    }, [router, album?.albumId]);

    const handleOpenActivity = useCallback(() => {
      if (album?.albumId) router.push(`/album/${album.albumId}/activity`);
    }, [router, album?.albumId]);

    return (
      <View style={[styles.container, { paddingTop: topInset + 12 }]}>
        {/* Near-white blurred echo of the album picture behind the whole
            header, including the transparent nav bar area. Extends upward
            so the iOS overscroll bounce stays covered. */}
        {!!pictureUri && (
          <View style={styles.backdrop} pointerEvents="none">
            <CachedImage
              uri={pictureUri}
              style={styles.backdropImage}
              blurRadius={22}
              showPlaceholder={false}
            />
            <View style={styles.backdropWash} />
          </View>
        )}

        <View style={styles.topRow}>
          <Pressable
            onPress={handleOpenPicker}
            disabled={!canPickPicture}
            style={styles.pictureContainer}
          >
            {pictureUri ? (
              <CachedImage uri={pictureUri} style={styles.picture} />
            ) : (
              <View style={styles.picturePlaceholder}>
                <Ionicons name="images-outline" size={28} color="#bbb" />
              </View>
            )}
            {canPickPicture && (
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={13} color="#fff" />
              </View>
            )}
          </Pressable>

          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={2}>
              {album?.title ?? "Album"}
            </Text>
            <Text style={styles.meta}>
              {assets.length} {assets.length === 1 ? "photo" : "photos"}
            </Text>
          </View>

          <GlassCircleButton onPress={handleOpenActivity} label="Album activity">
            <Ionicons name="pulse-outline" size={17} color="#111" />
          </GlassCircleButton>

          <GlassCircleButton onPress={handleOpenChat} label="Album chat">
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={17}
              color="#111"
            />
          </GlassCircleButton>

          <GlassCircleButton onPress={handleOpenMap} label="Album map">
            <Ionicons name="map-outline" size={17} color="#111" />
          </GlassCircleButton>
        </View>

        {!!album?.description && (
          <Text style={styles.description}>{album.description}</Text>
        )}

        {members.length > 0 && (
          <View style={styles.membersRow}>
            <AvatarListRow
              avatars={members}
              maxAvatars={5}
              avatarSize={30}
              gap={-8}
            />
            {memberSummary && (
              <Text style={styles.membersText} numberOfLines={1}>
                {memberSummary}
              </Text>
            )}
            <Pressable onPress={handleAddMember} style={styles.addMemberButton}>
              <Ionicons name="add" size={18} color="#000" />
            </Pressable>
          </View>
        )}

        {album?.albumId && (
          <CoverPhotoPicker
            visible={pickerVisible}
            albumId={album.albumId}
            assets={assets}
            currentCoverId={album.coverPhoto?.photoId ?? null}
            onClose={handleClosePicker}
          />
        )}
      </View>
    );
  },
);
AlbumHeader.displayName = "AlbumHeader";

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    overflow: "visible",
  },
  backdrop: {
    position: "absolute",
    // Reaches above the header so the overscroll bounce stays tinted
    top: -400,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  backdropImage: {
    width: "100%",
    height: "100%",
    // Hide the soft edges heavy blur produces
    transform: [{ scale: 1.2 }],
  },
  backdropWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  pictureContainer: {
    width: PICTURE_SIZE,
    height: PICTURE_SIZE,
  },
  picture: {
    width: PICTURE_SIZE,
    height: PICTURE_SIZE,
    borderRadius: 24,
  },
  picturePlaceholder: {
    width: PICTURE_SIZE,
    height: PICTURE_SIZE,
    borderRadius: 24,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    lineHeight: 29,
  },
  meta: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginTop: 12,
  },
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  membersText: {
    flex: 1,
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  addMemberButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AlbumHeader;
