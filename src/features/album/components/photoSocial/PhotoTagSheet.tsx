/**
 * PhotoTagSheet — bottom sheet for freeform text tags on a photo.
 * The photo's current tags show as removable chips at the top, a text
 * input adds new tags (normalized client-side to mirror the server:
 * trim, strip a leading '#', collapse whitespace, lowercase, 40 chars),
 * and suggestion chips below surface the album's existing tags with
 * usage counts for one-tap reuse.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import {
  useAlbumPhotoTagsQuery,
  useTagPhotoMutation,
  useUntagPhotoMutation,
} from "@/features/album/api/photo.queries";
import { PhotoTag } from "./photoSocial.types";
import SocialBottomSheet from "./SocialBottomSheet";
import { formatCompactCount } from "./socialUtils";

const MAX_TAG_LENGTH = 40;

/**
 * Client-side mirror of the server's tag normalization: trim, strip ALL
 * leading '#' (idempotent — the tag is normalized again server-side),
 * collapse internal whitespace, lowercase, cap at 40 chars. Dot-only
 * tags ("."/"..") normalize to empty — they'd collapse as URL
 * dot-segments on the delete route.
 */
export const normalizeTag = (raw: string): string => {
  const tag = raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
  return tag === "." || tag === ".." ? "" : tag;
};

export type PhotoTagSheetProps = {
  albumId: string;
  photoId: string | null;
  visible: boolean;
  onClose: () => void;
  /** The photo's current tags (from photo.social). */
  tags: PhotoTag[];
};

export const PhotoTagSheet: React.FC<PhotoTagSheetProps> = ({
  albumId,
  photoId,
  visible,
  onClose,
  tags,
}) => {
  const tagPhoto = useTagPhotoMutation(albumId);
  const untagPhoto = useUntagPhotoMutation(albumId);
  const albumTagsQuery = useAlbumPhotoTagsQuery(albumId);

  const [draft, setDraft] = useState("");
  // Tags with a request still in flight, keyed by the normalized tag text
  const [pendingTags, setPendingTags] = useState<Set<string>>(new Set());

  // Reset the draft whenever the sheet closes / retargets
  useEffect(() => {
    if (!visible) setDraft("");
  }, [visible, photoId]);

  const appliedTags = useMemo(
    () => new Set(tags.map((item) => item.tag)),
    [tags],
  );

  const normalizedDraft = normalizeTag(draft);
  const canAdd =
    !!photoId && normalizedDraft.length > 0 && !appliedTags.has(normalizedDraft);

  const settle = useCallback((tag: string) => {
    setPendingTags((prev) => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  }, []);

  const handleAdd = useCallback(
    (raw: string) => {
      const tag = normalizeTag(raw);
      if (!photoId || !tag || pendingTags.has(tag)) return;
      if (appliedTags.has(tag)) {
        setDraft("");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDraft("");
      setPendingTags((prev) => new Set(prev).add(tag));
      tagPhoto.mutate({ photoId, tag }, { onSettled: () => settle(tag) });
    },
    [photoId, pendingTags, appliedTags, tagPhoto, settle],
  );

  const handleRemove = useCallback(
    (tag: string) => {
      if (!photoId || pendingTags.has(tag)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPendingTags((prev) => new Set(prev).add(tag));
      untagPhoto.mutate({ photoId, tag }, { onSettled: () => settle(tag) });
    },
    [photoId, pendingTags, untagPhoto, settle],
  );

  const handleSubmitDraft = useCallback(() => {
    handleAdd(draft);
  }, [handleAdd, draft]);

  const suggestions = useMemo(
    () =>
      (albumTagsQuery.data ?? []).filter(
        (item) => !appliedTags.has(item.tag),
      ),
    [albumTagsQuery.data, appliedTags],
  );

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Tags"
      heightFraction={0.6}
    >
      {/* Current tags as removable chips */}
      {tags.length > 0 && (
        <View style={styles.chipsRow}>
          {tags.map((item) => {
            const isPending = pendingTags.has(item.tag);
            return (
              <Animated.View
                key={item.tag}
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(120)}
              >
                <Pressable
                  onPress={() => handleRemove(item.tag)}
                  disabled={isPending}
                  style={[styles.chip, isPending && styles.chipPending]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove tag ${item.tag}`}
                  accessibilityState={{ disabled: isPending }}
                >
                  <Ionicons
                    name="pricetag"
                    size={12}
                    color="rgba(255, 255, 255, 0.75)"
                  />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {item.tag}
                  </Text>
                  <Ionicons
                    name="close"
                    size={13}
                    color="rgba(255, 255, 255, 0.6)"
                  />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Add-tag input */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a tag…"
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={MAX_TAG_LENGTH}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={handleSubmitDraft}
          accessibilityLabel="Tag input"
        />
        <Pressable
          onPress={handleSubmitDraft}
          disabled={!canAdd}
          style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add tag"
          accessibilityState={{ disabled: !canAdd }}
        >
          <Ionicons
            name="add"
            size={20}
            color={canAdd ? "#000" : "rgba(255,255,255,0.4)"}
          />
        </Pressable>
      </View>
      {/* Normalization preview when it would change what's typed */}
      {normalizedDraft.length > 0 && normalizedDraft !== draft.trim() && (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(120)}
          style={styles.previewRow}
        >
          <Text style={styles.previewText} numberOfLines={1}>
            Will be added as “{normalizedDraft}”
          </Text>
        </Animated.View>
      )}

      {/* Suggestions from across the album */}
      {suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="pricetags-outline"
            size={32}
            color="rgba(255, 255, 255, 0.35)"
          />
          <Text style={styles.emptyText}>
            Tags make photos easy to find later
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.suggestionsContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.suggestionsLabel}>In this album</Text>
          <View style={styles.suggestionsRow}>
            {suggestions.map((item) => {
              const isPending = pendingTags.has(item.tag);
              return (
                <Pressable
                  key={item.tag}
                  onPress={() => handleAdd(item.tag)}
                  disabled={isPending}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    pressed && styles.suggestionChipPressed,
                    isPending && styles.chipPending,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add tag ${item.tag}, used ${item.count} times`}
                  accessibilityState={{ disabled: isPending }}
                >
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {item.tag}
                    <Text style={styles.suggestionCount}>
                      {"  ·  "}
                      {formatCompactCount(item.count)}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 15,
    paddingHorizontal: 10,
    height: 30,
    maxWidth: 200,
  },
  chipPending: {
    opacity: 0.5,
  },
  chipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    flexShrink: 1,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 19,
    paddingHorizontal: 14,
    color: "#fff",
    fontSize: 15,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  previewRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  previewText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
  },
  suggestionsContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  suggestionsLabel: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 11,
    height: 30,
    justifyContent: "center",
    maxWidth: 220,
  },
  suggestionChipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  suggestionText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
  },
  suggestionCount: {
    color: "rgba(255, 255, 255, 0.5)",
    fontFamily: "InstrumentSans_400Regular",
    fontWeight: "400",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 10,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
  },
});

export default PhotoTagSheet;
