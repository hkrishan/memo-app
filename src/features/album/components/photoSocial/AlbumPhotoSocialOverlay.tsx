/**
 * AlbumPhotoSocialOverlay
 * The album-context social layer mounted into the fullscreen PhotoViewer
 * via its renderSocialOverlay slot: the like/comment/tag bar floating
 * above the filmstrip (fading in sync with the viewer chrome) plus the
 * comments and tag sheets it opens. The photo's social summary is looked
 * up in the album photos cache by the viewer asset's id (= photoId), so
 * the overlay needs no data plumbing from the viewer itself.
 *
 * Exposes an imperative handle so the viewer can forward a double-tap
 * gesture: `doubleTapLike()` likes the photo (if not already liked) and
 * always plays a center-screen heart burst.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  cancelAnimation,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Image } from "expo-image";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import { MediaAsset } from "../../hooks";
import { PhotoWithUploader } from "../../types/album.types";
import { memberColor } from "../../memberColor";
import { useGetAlbumQuery } from "../../api/album.queries";
import {
  useDeletePhotoMutation,
  useGetPhotosQuery,
  useTogglePhotoLikeMutation,
} from "../../api/photo.queries";
import { useAuthStore } from "@/features/auth/store/authStore";
import { notify } from "@/components/global";
import { ReportContentSheet } from "@/features/moderation";
import { PhotoSocialBar } from "./PhotoSocialBar";
import { CommentsSheet } from "./CommentsSheet";
import { PhotoTagSheet } from "./PhotoTagSheet";
import { DeleteConfirmSheet } from "./DeleteConfirmSheet";

/** "now" / "12m" / "3h" / "5d" / "2 Jan" — compact, chrome-sized. */
const compactTimeAgo = (iso: string): string => {
  const then = dayjs(iso);
  if (!then.isValid()) return "";
  const minutes = dayjs().diff(then, "minute");
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return then.format("D MMM");
};

const HEART_SIZE = 96;
// Spring up ~420ms, then fade + drift out — ~700ms total
const BURST_EXIT_DELAY = 420;
const BURST_EXIT_DURATION = 280;
const BURST_TOTAL_MS = BURST_EXIT_DELAY + BURST_EXIT_DURATION;

export interface AlbumPhotoSocialOverlayHandle {
  /**
   * Called by the viewer on a double-tap over the photo: likes the photo
   * if not already liked, and always plays the center heart burst.
   * `photoId` is the photo actually on screen as resolved by the viewer's
   * live scroll position — during a page-settle it can be ahead of this
   * overlay's own (state-driven) asset prop, so prefer it when given.
   */
  doubleTapLike: (photoId?: string) => void;
}

interface AlbumPhotoSocialOverlayProps {
  albumId: string;
  /** The viewer's current asset — its id is the album photoId. */
  asset: MediaAsset;
  /** Mirrors the viewer chrome so the bar fades with it. */
  chromeVisible: boolean;
  /**
   * The viewer's shared entrance progress (the open transition's own
   * motion; 1 once settled) — the bar rides it in with the photo.
   */
  intro?: SharedValue<number>;
  /**
   * The chrome's live visibility (toggle fade, pan-dismiss coupling,
   * dismissal fade) — UI-thread-driven so the bar can never lag the
   * header/filmstrip by a frame.
   */
  visibility?: SharedValue<number>;
  /** Px from the screen bottom that clears the viewer's filmstrip. */
  bottomInset: number;
  /** Viewer-provided animated dismiss (used after deleting the photo). */
  requestClose?: () => void;
  /**
   * Delete choreography hooks for the grid beneath: `onDeleteStarted`
   * fires at confirm (the cell starts its pop-away while the viewer
   * dismisses); `onDeleteFailed` fires if the server rejects it (the
   * cell pops back in).
   */
  onDeleteStarted?: (photoId: string) => void;
  onDeleteFailed?: (photoId: string) => void;
}

export const AlbumPhotoSocialOverlay = forwardRef<
  AlbumPhotoSocialOverlayHandle,
  AlbumPhotoSocialOverlayProps
>(
  (
    {
      albumId,
      asset,
      chromeVisible,
      intro,
      visibility,
      bottomInset,
      requestClose,
      onDeleteStarted,
      onDeleteFailed,
    },
    ref,
  ) => {
  const insets = useSafeAreaInsets();
  const { data: photos } = useGetPhotosQuery(albumId);
  const { data: album } = useGetAlbumQuery(albumId);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const toggleLike = useTogglePhotoLikeMutation(albumId);
  const deletePhoto = useDeletePhotoMutation();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  // Renders as an in-modal sheet for the same stacking reason as delete
  const [reportOpen, setReportOpen] = useState(false);
  // Which photo the sheets show. Set at open and RETAINED through close —
  // nulling it at close would blank the sheet's content mid-animation.
  // The comments query keys off this, so merely browsing photos (sheet
  // never opened) fetches nothing.
  const [sheetPhotoId, setSheetPhotoId] = useState<string | null>(null);

  // The bar enters in the viewer's own open motion (shared intro
  // progress) and fades with the viewer's own chrome visibility (toggle,
  // pan-dismiss, dismissal) — both UI-thread values, so it moves and
  // fades in perfect sync with the header and filmstrip. No JS-effect
  // animation here: that started a frame late under load and flickered.
  const barStyle = useAnimatedStyle(() => {
    const introProgress = intro ? intro.value : 1;
    const visible = visibility ? visibility.value : 1;
    return {
      opacity: introProgress * visible,
      transform: [{ translateY: (1 - introProgress) * 16 }],
    };
  });

  // Paging to another photo resets the sheet session (they're closed —
  // the sheet backdrop blocks page swipes — this is hygiene for jumps)
  useEffect(() => {
    setSheetPhotoId(null);
    setCommentsOpen(false);
    setTagsOpen(false);
    setDeleteConfirmOpen(false);
    setReportOpen(false);
  }, [asset.id]);

  // Device-library assets have no album photo — no social layer for them.
  // A photo missing only TRANSIENTLY (mid-refetch cache miss) must not
  // unmount open sheets or a half-typed draft: fall back to the last
  // photo seen for this same asset.
  const found = photos?.find((p) => p.photoId === asset.id);
  const lastPhotoRef = useRef<PhotoWithUploader | null>(null);
  if (found) {
    lastPhotoRef.current = found;
  } else if (lastPhotoRef.current?.photoId !== asset.id) {
    lastPhotoRef.current = null;
  }
  const photo = found ?? lastPhotoRef.current;

  // --- Double-tap heart burst -------------------------------------------
  const [burstVisible, setBurstVisible] = useState(false);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstScale = useSharedValue(0);
  const burstOpacity = useSharedValue(0);
  const burstTranslateY = useSharedValue(0);

  useEffect(
    () => () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    },
    [],
  );

  const playHeartBurst = useCallback(() => {
    // Re-triggering mid-animation restarts the burst from the top
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    cancelAnimation(burstScale);
    cancelAnimation(burstOpacity);
    cancelAnimation(burstTranslateY);
    setBurstVisible(true);

    burstScale.value = 0;
    burstOpacity.value = 1;
    burstTranslateY.value = 0;
    burstScale.value = withSequence(
      withSpring(1.15, { damping: 12, stiffness: 420 }),
      withSpring(1, { damping: 15, stiffness: 320 }),
    );
    burstOpacity.value = withDelay(
      BURST_EXIT_DELAY,
      withTiming(0, { duration: BURST_EXIT_DURATION }),
    );
    burstTranslateY.value = withDelay(
      BURST_EXIT_DELAY,
      withTiming(-36, { duration: BURST_EXIT_DURATION }),
    );

    burstTimeoutRef.current = setTimeout(() => {
      setBurstVisible(false);
      burstTimeoutRef.current = null;
    }, BURST_TOTAL_MS + 40);
  }, [burstScale, burstOpacity, burstTranslateY]);

  const doubleTapLike = useCallback(
    (photoId?: string) => {
      // The viewer's live index can be a page ahead of our asset prop
      // mid-settle — like the photo the user actually tapped
      const target =
        photoId != null && photoId !== photo?.photoId
          ? photos?.find((p) => p.photoId === photoId)
          : photo;
      if (!target) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!target.social?.likedByMe) {
        toggleLike.mutate({ photoId: target.photoId, like: true });
      }
      // The burst plays whether or not the photo was already liked
      playHeartBurst();
    },
    [photo, photos, toggleLike, playHeartBurst],
  );

  useImperativeHandle(ref, () => ({ doubleTapLike }), [doubleTapLike]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
    transform: [
      { translateY: burstTranslateY.value },
      { scale: burstScale.value },
    ],
  }));
  // ----------------------------------------------------------------------

  const openComments = useCallback(() => {
    const id = photo?.photoId;
    if (!id) return;
    setSheetPhotoId(id);
    setCommentsOpen(true);
  }, [photo?.photoId]);
  const closeComments = useCallback(() => setCommentsOpen(false), []);
  const openTags = useCallback(() => {
    const id = photo?.photoId;
    if (!id) return;
    setSheetPhotoId(id);
    setTagsOpen(true);
  }, [photo?.photoId]);
  const closeTags = useCallback(() => setTagsOpen(false), []);

  // Attribution fades/moves exactly like the bar, but settles downward
  // from under the header instead of rising from the bottom
  const attributionStyle = useAnimatedStyle(() => {
    const introProgress = intro ? intro.value : 1;
    const visible = visibility ? visibility.value : 1;
    return {
      opacity: introProgress * visible,
      transform: [{ translateY: (1 - introProgress) * -10 }],
    };
  });

  // Delete: uploader or album owner only (the server enforces the same
  // rule — this just decides whether the pill shows at all)
  const canDelete =
    !!currentUserId &&
    (photo?.uploader?.userId === currentUserId ||
      album?.ownerId === currentUserId);

  // Confirm renders as an in-modal sheet: a root-level popup would stack
  // BENEATH the viewer's modal and be unreachable until it closed
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Report: other people's photos only (uploader unknown → no report,
  // there's nobody to attribute the content to)
  const canReport =
    !!currentUserId &&
    photo?.uploader != null &&
    photo.uploader.userId !== currentUserId;

  // sheetPhotoId is set at open and retained through close so the report
  // target doesn't blank mid-animation.
  const handleReportPress = useCallback(() => {
    const id = photo?.photoId;
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetPhotoId(id);
    setReportOpen(true);
  }, [photo?.photoId]);
  const closeReport = useCallback(() => setReportOpen(false), []);

  const handleDeletePress = useCallback(() => {
    if (!photo || deletePhoto.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDeleteConfirmOpen(true);
  }, [photo, deletePhoto.isPending]);
  const closeDeleteConfirm = useCallback(
    () => setDeleteConfirmOpen(false),
    [],
  );

  const handleDeleteConfirm = useCallback((alsoLibrary: boolean) => {
    const target = photo;
    if (!target || deletePhoto.isPending) return;
    setDeleteConfirmOpen(false);
    // Choreography: the viewer starts dismissing NOW while the grid cell
    // beneath begins its pop-away; the server delete runs alongside and
    // the eventual refetch removes the (already invisible) cell
    onDeleteStarted?.(target.photoId);
    requestClose?.();
    deletePhoto.mutate(
      { albumId, photoId: target.photoId, alsoLibrary },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: () => {
          // Pop the cell back in and say why
          onDeleteFailed?.(target.photoId);
          notify.error("Couldn't delete photo", "Please try again.");
        },
      },
    );
  }, [
    photo,
    deletePhoto,
    albumId,
    requestClose,
    onDeleteStarted,
    onDeleteFailed,
  ]);

  if (!photo) return null;

  // The uploader's album identity color (members ride on the album query)
  const uploaderMember = album?.members?.find(
    (m) => m.userId === photo.uploader?.userId,
  );
  const uploaderRing = memberColor(uploaderMember);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {burstVisible && (
        <View style={styles.burstLayer} pointerEvents="none">
          <Animated.View style={burstStyle}>
            <Ionicons
              name="heart"
              size={HEART_SIZE}
              color="#fff"
              style={styles.burstHeart}
            />
          </Animated.View>
        </View>
      )}
      {/* Who took it — small pill under the viewer's header chrome */}
      {photo.uploader != null && (
        <Animated.View
          style={[
            styles.attributionRow,
            { top: insets.top + 58 },
            attributionStyle,
          ]}
          pointerEvents="none"
        >
          <View style={styles.attributionPill}>
            {photo.uploader.avatarUrl ? (
              <Image
                source={{ uri: photo.uploader.avatarUrl }}
                style={[
                  styles.attributionAvatar,
                  { borderWidth: 2, borderColor: uploaderRing },
                ]}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.attributionAvatar,
                  styles.attributionAvatarFallback,
                  { borderWidth: 2, borderColor: uploaderRing },
                ]}
              >
                <Ionicons name="person" size={11} color="#ccc" />
              </View>
            )}
            <Text style={styles.attributionName} numberOfLines={1}>
              {photo.uploader.name}
            </Text>
            {compactTimeAgo(photo.createdAt) !== "" && (
              <Text style={styles.attributionTime}>
                {compactTimeAgo(photo.createdAt)}
              </Text>
            )}
          </View>
        </Animated.View>
      )}
      <Animated.View
        style={[styles.barRow, { bottom: bottomInset }, barStyle]}
        pointerEvents={chromeVisible ? "box-none" : "none"}
      >
        <PhotoSocialBar
          albumId={albumId}
          photoId={photo.photoId}
          social={photo.social}
          onOpenComments={openComments}
          onOpenTags={openTags}
          onDelete={canDelete ? handleDeletePress : undefined}
          onReport={canReport ? handleReportPress : undefined}
        />
      </Animated.View>
      <CommentsSheet
        albumId={albumId}
        photoId={sheetPhotoId}
        visible={commentsOpen}
        onClose={closeComments}
        currentUserId={currentUserId}
      />
      <PhotoTagSheet
        albumId={albumId}
        photoId={sheetPhotoId}
        visible={tagsOpen}
        onClose={closeTags}
        tags={photo.social?.tags ?? []}
      />
      <DeleteConfirmSheet
        visible={deleteConfirmOpen}
        onClose={closeDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        isUploader={photo?.uploader?.userId === currentUserId}
        busy={deletePhoto.isPending}
      />
      <ReportContentSheet
        visible={reportOpen}
        target={
          sheetPhotoId
            ? { targetType: "photo", targetId: sheetPhotoId, albumId }
            : null
        }
        onClose={closeReport}
      />
    </View>
  );
});

AlbumPhotoSocialOverlay.displayName = "AlbumPhotoSocialOverlay";

const styles = StyleSheet.create({
  barRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  attributionRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  attributionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
    maxWidth: 260,
  },
  // Slightly bigger than pre-ring (18) so the 2px identity ring doesn't
  // swallow the photo
  attributionAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  attributionAvatarFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  attributionName: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  attributionTime: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12,
  },
  burstLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  burstHeart: {
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
});

export default AlbumPhotoSocialOverlay;
