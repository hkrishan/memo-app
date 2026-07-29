/**
 * CommentsSheet — custom bottom sheet listing a photo's comments with a
 * composer pinned above the keyboard. Long-pressing your own comment reveals
 * a small inline delete confirmation (no Alert). Adds optimistically via the
 * mutation hooks; the hooks own the cache updates.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import {
  useAddPhotoCommentMutation,
  useDeletePhotoCommentMutation,
  usePhotoCommentsQuery,
} from "@/features/album/api/photo.queries";
import { PhotoComment } from "./photoSocial.types";
import SocialAvatar from "./SocialAvatar";
import SocialBottomSheet from "./SocialBottomSheet";
import { formatRelativeTime } from "./socialUtils";
import { notify } from "@/components/global";

const MAX_COMMENT_LENGTH = 500;

export type CommentsSheetProps = {
  albumId: string;
  photoId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
};

type CommentRowProps = {
  comment: PhotoComment;
  isOwn: boolean;
  confirmingDelete: boolean;
  onLongPress: (commentId: string) => void;
  onConfirmDelete: (commentId: string) => void;
  onCancelDelete: () => void;
};

const CommentRow: React.FC<CommentRowProps> = ({
  comment,
  isOwn,
  confirmingDelete,
  onLongPress,
  onConfirmDelete,
  onCancelDelete,
}) => {
  const handleLongPress = useCallback(() => {
    if (!isOwn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(comment.commentId);
  }, [isOwn, comment.commentId, onLongPress]);

  return (
    <Animated.View layout={LinearTransition.springify().damping(18)}>
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.commentRow,
          pressed && isOwn && styles.commentRowPressed,
        ]}
        accessibilityLabel={`Comment from ${comment.author.name}: ${comment.content}`}
        accessibilityHint={isOwn ? "Long press to delete" : undefined}
      >
        <SocialAvatar
          name={comment.author.name}
          avatarUrl={comment.author.avatarUrl}
          size={32}
        />
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={styles.authorName} numberOfLines={1}>
              {comment.author.name}
            </Text>
            <Text style={styles.timestamp}>
              {formatRelativeTime(comment.createdAt)}
            </Text>
          </View>
          <Text style={styles.commentText}>{comment.content}</Text>
        </View>

        {confirmingDelete && (
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(120)}
            style={styles.deleteActions}
          >
            <Pressable
              onPress={() => onConfirmDelete(comment.commentId)}
              style={styles.deleteButton}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
            >
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
            <Pressable
              onPress={onCancelDelete}
              style={styles.cancelButton}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete"
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export const CommentsSheet: React.FC<CommentsSheetProps> = ({
  albumId,
  photoId,
  visible,
  onClose,
  currentUserId,
}) => {
  const commentsQuery = usePhotoCommentsQuery(albumId, photoId);
  const addComment = useAddPhotoCommentMutation(albumId);
  const deleteComment = useDeletePhotoCommentMutation(albumId);

  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);

  // Reset transient state whenever the sheet targets a new photo / reopens
  useEffect(() => {
    if (!visible) {
      setDraft("");
      setConfirmingId(null);
      setSendFailed(false);
    }
  }, [visible, photoId]);

  const comments: PhotoComment[] = commentsQuery.data ?? [];
  const canSend = draft.trim().length > 0 && !!photoId;

  const handleSend = useCallback(() => {
    const content = draft.trim();
    if (!content || !photoId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSendFailed(false);
    setDraft("");
    addComment.mutate(
      { photoId, content },
      {
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Restore the draft unless the user has started typing again
          setDraft((current) => (current.trim().length > 0 ? current : content));
          setSendFailed(true);
        },
      },
    );
  }, [draft, photoId, addComment]);

  const handleConfirmDelete = useCallback(
    (commentId: string) => {
      if (!photoId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      deleteComment.mutate(
        { photoId, commentId },
        {
          onError: () => {
            notify.error("Couldn't delete comment", "Please try again");
          },
        },
      );
      setConfirmingId(null);
    },
    [photoId, deleteComment],
  );

  const renderComment = useCallback(
    ({ item }: { item: PhotoComment }) => (
      <CommentRow
        comment={item}
        isOwn={!!currentUserId && item.author.userId === currentUserId}
        confirmingDelete={confirmingId === item.commentId}
        onLongPress={setConfirmingId}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={() => setConfirmingId(null)}
      />
    ),
    [currentUserId, confirmingId, handleConfirmDelete],
  );

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Comments"
      heightFraction={0.68}
    >
      {commentsQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="rgba(255,255,255,0.6)" />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={36}
            color="rgba(255, 255, 255, 0.35)"
          />
          <Text style={styles.emptyText}>Be the first to say something</Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.commentId}
          renderItem={renderComment}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setConfirmingId(null)}
        />
      )}

      {sendFailed && (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(120)}
          style={styles.sendErrorRow}
        >
          <Ionicons name="alert-circle" size={14} color="#FF3B30" />
          <Text style={styles.sendErrorText}>
            {"Couldn't send your comment. Try again."}
          </Text>
        </Animated.View>
      )}

      {/* Composer */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          multiline
          maxLength={MAX_COMMENT_LENGTH}
          accessibilityLabel="Comment input"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          accessibilityState={{ disabled: !canSend }}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? "#000" : "rgba(255,255,255,0.4)"}
          />
        </Pressable>
      </View>
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  commentRowPressed: {
    opacity: 0.75,
  },
  commentBody: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  authorName: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    flexShrink: 1,
  },
  timestamp: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
  },
  commentText: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  deleteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF3B30",
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    gap: 10,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
  },
  sendErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sendErrorText: {
    color: "#FF3B30",
    fontSize: 12,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    color: "#fff",
    fontSize: 15,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
});

export default CommentsSheet;
