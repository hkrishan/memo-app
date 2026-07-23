/**
 * EditAlbumScreen — owner-only "Album Settings" editor: rename the album,
 * edit its description and pick a cover photo (or let it follow the
 * latest upload). Pushed from the album's Settings tab.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { notify } from "@/components/global";
import { useAuthStore } from "@/features/auth/store/authStore";
import {
  useGetAlbumQuery,
  useUpdateAlbumMutation,
} from "../api/album.queries";
import { useGetPhotosQuery } from "../api/photo.queries";
import { UpdateAlbumParams } from "../api/album.api";

const COVER_SIZE = 72;

const EditAlbumScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();

  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data: album } = useGetAlbumQuery(albumId!);
  const { data: photos } = useGetPhotosQuery(albumId);
  const updateMutation = useUpdateAlbumMutation(albumId!);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // undefined = untouched; null = follow latest upload; string = photoId
  const [coverPhotoId, setCoverPhotoId] = useState<string | null | undefined>(
    undefined,
  );

  // Hydrate the form once from the loaded album (placeholderData can hand
  // us the album on first render, so also handle the sync case)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (album && !hydratedRef.current) {
      hydratedRef.current = true;
      setTitle(album.title);
      setDescription(album.description ?? "");
    }
  }, [album]);

  const isOwner = !!album && !!currentUserId && album.ownerId === currentUserId;

  const savedCover = album?.coverPhotoId ?? null;
  const effectiveCover = coverPhotoId === undefined ? savedCover : coverPhotoId;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const dirty =
    !!album &&
    hydratedRef.current &&
    (trimmedTitle !== album.title ||
      trimmedDescription !== (album.description ?? "") ||
      effectiveCover !== savedCover);
  const canSave = dirty && trimmedTitle.length > 0 && !updateMutation.isPending;

  const handleSave = useCallback(() => {
    if (!album || !canSave) return;
    const input: UpdateAlbumParams = {};
    if (trimmedTitle !== album.title) {
      input.title = trimmedTitle;
    }
    if (trimmedDescription !== (album.description ?? "")) {
      input.description = trimmedDescription.length ? trimmedDescription : null;
    }
    if (effectiveCover !== savedCover) {
      input.coverPhotoId = effectiveCover;
    }
    updateMutation.mutate(input, {
      onSuccess: () => {
        notify.success("Album updated");
        router.back();
      },
      onError: () => {
        notify.error("Couldn't save changes", "Please try again.");
      },
    });
  }, [
    album,
    canSave,
    trimmedTitle,
    trimmedDescription,
    effectiveCover,
    savedCover,
    updateMutation,
    router,
  ]);

  // Cover candidates: photos show their thumbnail (or full url); videos
  // are represented by their poster and skipped when they have none
  const coverCandidates = useMemo(
    () =>
      (photos ?? [])
        .map((photo) => ({
          photoId: photo.photoId,
          uri:
            photo.thumbnailUrl ??
            (photo.mediaType === "video" ? null : photo.url),
          isVideo: photo.mediaType === "video",
        }))
        .filter((c): c is typeof c & { uri: string } => c.uri != null),
    [photos],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Album Settings</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={styles.saveButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={[styles.saveLabel, !canSave && styles.saveDisabled]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      {album && !isOwner ? (
        <View style={styles.notOwner}>
          <Ionicons name="lock-closed-outline" size={32} color="#999" />
          <Text style={styles.notOwnerText}>
            Only the album owner can edit these settings
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Album name"
            placeholderTextColor="#a5a5ad"
            maxLength={255}
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this album about?"
            placeholderTextColor="#a5a5ad"
            maxLength={1024}
            multiline
          />

          <Text style={styles.fieldLabel}>Cover photo</Text>
          <Text style={styles.fieldHint}>
            Auto keeps the cover on the newest photo
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.coverRow}
          >
            {/* Auto: follow the latest upload */}
            <Pressable
              onPress={() => setCoverPhotoId(null)}
              style={[
                styles.coverTile,
                styles.coverAuto,
                effectiveCover === null && styles.coverSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Automatic cover"
            >
              <Ionicons name="sparkles-outline" size={20} color="#666" />
              <Text style={styles.coverAutoLabel}>Auto</Text>
            </Pressable>

            {coverCandidates.map((candidate) => (
              <Pressable
                key={candidate.photoId}
                onPress={() => setCoverPhotoId(candidate.photoId)}
                style={[
                  styles.coverTile,
                  effectiveCover === candidate.photoId && styles.coverSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Use as cover photo"
              >
                <Image
                  source={{ uri: candidate.uri }}
                  style={styles.coverImage}
                  contentFit="cover"
                  recyclingKey={candidate.photoId}
                />
                {candidate.isVideo && (
                  <View style={styles.coverVideoBadge}>
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                )}
                {effectiveCover === candidate.photoId && (
                  <View style={styles.coverCheck}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  saveButton: {
    minWidth: 40,
    height: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  saveDisabled: {
    color: "#b6b6bc",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 60,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
  },
  fieldHint: {
    fontSize: 13,
    color: "#999",
    marginTop: -4,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#000",
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  coverRow: {
    gap: 10,
    paddingVertical: 4,
    paddingRight: 16,
  },
  coverTile: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#f0f0f3",
  },
  coverAuto: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  coverAutoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
  },
  coverSelected: {
    borderWidth: 2.5,
    borderColor: "#000",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverVideoBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverCheck: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  notOwner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  notOwnerText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
  },
});

export default EditAlbumScreen;
