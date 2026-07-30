/**
 * PostCommentsSheet — bottom sheet listing a page post's comments with a
 * composer pinned above the keyboard. Uses the shared SocialBottomSheet
 * chrome in its light editorial appearance (white sheet, "Comments N"
 * header, hairline dividers): ink-on-white rows, an AUTHOR badge on the
 * post author's comments, and a composer with the viewer's avatar and a
 * black send button. Long-press-your-own-comment inline delete as before.
 * Adds via the mutation hooks; the hooks own the cache updates (comment
 * list + the post's commentCount on both the page-posts list and the home
 * feed).
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
import { notify } from "@/components/global";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import SocialAvatar from "@/features/album/components/photoSocial/SocialAvatar";
import SocialBottomSheet from "@/features/album/components/photoSocial/SocialBottomSheet";
import { formatRelativeTime } from "@/features/album/components/photoSocial/socialUtils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { color, font } from "@/lib/tokens";
import {
  useAddPostCommentMutation,
  useDeletePostCommentMutation,
  usePostCommentsQuery,
} from "../api/pagePost.queries";
import { PostComment } from "../types/post.types";

const MAX_COMMENT_LENGTH = 500;

export type PostCommentsSheetProps = {
  albumId: string;
  pageId: string;
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  /** The post author's userId — their comments get an AUTHOR badge. */
  postAuthorId?: string;
};

type CommentRowProps = {
  comment: PostComment;
  isOwn: boolean;
  isAuthor: boolean;
  confirmingDelete: boolean;
  onLongPress: (commentId: string) => void;
  onConfirmDelete: (commentId: string) => void;
  onCancelDelete: () => void;
};

const CommentRow: React.FC<CommentRowProps> = ({
  comment,
  isOwn,
  isAuthor,
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
          size={36}
          surface="light"
        />
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={styles.authorName} numberOfLines={1}>
              {comment.author.name}
            </Text>
            {isAuthor && (
              <View style={styles.authorBadge}>
                <Text style={styles.authorBadgeText}>AUTHOR</Text>
              </View>
            )}
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
              <Ionicons name="close" size={16} color="#6E6E73" />
            </Pressable>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export const PostCommentsSheet: React.FC<PostCommentsSheetProps> = ({
  albumId,
  pageId,
  postId,
  visible,
  onClose,
  currentUserId,
  postAuthorId,
}) => {
  const commentsQuery = usePostCommentsQuery(albumId, pageId, postId);
  const addComment = useAddPostCommentMutation(albumId, pageId);
  const deleteComment = useDeletePostCommentMutation(albumId, pageId);
  const currentUser = useAuthStore((state) => state.user);

  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);

  // Reset transient state whenever the sheet targets a new post / reopens
  useEffect(() => {
    if (!visible) {
      setDraft("");
      setConfirmingId(null);
      setSendFailed(false);
    }
  }, [visible, postId]);

  const comments: PostComment[] = commentsQuery.data ?? [];
  const canSend = draft.trim().length > 0 && !!postId;

  const handleSend = useCallback(() => {
    const content = draft.trim();
    if (!content || !postId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSendFailed(false);
    setDraft("");
    addComment.mutate(
      { postId, content },
      {
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Restore the draft unless the user has started typing again
          setDraft((current) => (current.trim().length > 0 ? current : content));
          setSendFailed(true);
        },
      },
    );
  }, [draft, postId, addComment]);

  const handleConfirmDelete = useCallback(
    (commentId: string) => {
      if (!postId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      deleteComment.mutate(
        { postId, commentId },
        {
          onError: () => {
            notify.error("Couldn't delete comment", "Please try again");
          },
        },
      );
      setConfirmingId(null);
    },
    [postId, deleteComment],
  );

  const renderComment = useCallback(
    ({ item }: { item: PostComment }) => (
      <CommentRow
        comment={item}
        isOwn={!!currentUserId && item.author.userId === currentUserId}
        isAuthor={!!postAuthorId && item.author.userId === postAuthorId}
        confirmingDelete={confirmingId === item.commentId}
        onLongPress={setConfirmingId}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={() => setConfirmingId(null)}
      />
    ),
    [currentUserId, postAuthorId, confirmingId, handleConfirmDelete],
  );

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title="Comments"
      count={comments.length}
      appearance="light"
      heightFraction={0.68}
    >
      {commentsQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#8E8E93" />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={36}
            color="#C7C7CC"
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
          <Ionicons name="alert-circle" size={14} color={color.danger} />
          <Text style={styles.sendErrorText}>
            {"Couldn't send your comment. Try again."}
          </Text>
        </Animated.View>
      )}

      {/* Composer — the viewer's avatar, a hairline-bordered field and a
          black send button */}
      <View style={styles.composer}>
        <View style={styles.composerAvatar}>
          <SocialAvatar
            name={currentUser?.name ?? "You"}
            avatarUrl={currentUser?.avatarUrl ?? null}
            size={36}
            surface="light"
          />
        </View>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor={color.textTertiary}
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
            color={canSend ? color.textInverse : color.textTertiary}
          />
        </Pressable>
      </View>
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
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
    color: color.textPrimary,
    fontSize: 14,
    ...font.semibold,
    flexShrink: 1,
  },
  authorBadge: {
    backgroundColor: color.textPrimary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  authorBadgeText: {
    color: color.textInverse,
    fontSize: 9,
    ...font.bold,
    letterSpacing: 0.5,
  },
  timestamp: {
    color: color.textTertiary,
    fontSize: 12,
    ...font.regular,
  },
  commentText: {
    color: color.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    ...font.regular,
    marginTop: 3,
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
    backgroundColor: color.danger,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 12,
    ...font.semibold,
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.surface1,
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
    color: color.textSecondary,
    fontSize: 14,
    ...font.regular,
  },
  sendErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sendErrorText: {
    color: color.danger,
    fontSize: 12,
    ...font.regular,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  composerAvatar: {
    marginBottom: 3,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.12)",
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    color: color.textPrimary,
    fontSize: 15,
    ...font.regular,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: color.surface2,
  },
});

export default PostCommentsSheet;
