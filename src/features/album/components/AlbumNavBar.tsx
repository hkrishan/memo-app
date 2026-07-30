/**
 * AlbumNavBar Component
 * Transparent over the gallery header; the white background and hairline
 * fade in as the header scrolls under the bar. On the gallery tab the
 * bar's center holds the activity / chat / map actions (the header below
 * keeps the album title full-width); other tabs show their title.
 */

import React, { memo, useCallback } from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

import { GlassCircleButton } from "@/components/ui/GlassCircleButton";
import { font } from "@/lib/tokens";
import {
  useAlbumChatUnread,
  UNREAD_CAP,
} from "../screens/AlbumScreen/chat/unread/useAlbumChatUnread";
import {
  EDITORIAL_HERO_HEIGHT,
  GalleryVariant,
} from "../store/galleryVariantStore";

interface AlbumNavBarProps {
  albumId: string | undefined;
  scrollPosition: SharedValue<number>;
  galleryScrollY: SharedValue<number>;
  /** Page tab's scroll offset — same fade contract as the gallery */
  pageScrollY: SharedValue<number>;
  onBack: () => void;
  onSettingsPress: () => void;
  /**
   * Whether the album has a page yet. When it doesn't, the Page tab shows
   * its create-page hero and the nav bar melts away there — no "Page"
   * title, no frosted background, just the back button.
   */
  pageExists?: boolean;
  /**
   * Gallery A/B (galleryVariantStore). "editorial" swaps the chrome to
   * smoked glass over the variant's dark cover hero: the center
   * activity / chat / map cluster disappears (those live in the page
   * content there), the right side becomes a Share pill + overflow
   * button, and the white bar fades in at the hero's deeper thresholds.
   */
  galleryVariant?: GalleryVariant;
}

export const AlbumNavBar: React.FC<AlbumNavBarProps> = memo(
  ({
    albumId,
    scrollPosition,
    galleryScrollY,
    pageScrollY,
    onBack,
    onSettingsPress,
    pageExists = true,
    galleryVariant = "classic",
  }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const editorial = galleryVariant === "editorial";

    // Unread chat messages badge on the chat action; clears when the user
    // opens chat (the chat screen advances the last-read watermark).
    const chatUnreadCount = useAlbumChatUnread(albumId);

    // The action cluster fades with the gallery tab, but the Pressables
    // underneath would still catch taps — gate the handlers on actually
    // being on the gallery tab (reading the shared value at press time).
    const onGalleryTab = useCallback(
      () => scrollPosition.value < 0.5,
      [scrollPosition],
    );
    const handleOpenActivity = useCallback(() => {
      if (albumId && onGalleryTab()) router.push(`/album/${albumId}/activity`);
    }, [router, albumId, onGalleryTab]);
    const handleOpenChat = useCallback(() => {
      if (albumId && onGalleryTab()) router.push(`/album/${albumId}/chat`);
    }, [router, albumId, onGalleryTab]);
    const handleOpenMap = useCallback(() => {
      if (albumId && onGalleryTab()) router.push(`/album/${albumId}/map`);
    }, [router, albumId, onGalleryTab]);
    // Editorial "Share" — sharing an album IS inviting to it
    const handleShare = useCallback(() => {
      if (albumId && onGalleryTab())
        router.push(`/album/${albumId}/add-members`);
    }, [router, albumId, onGalleryTab]);

    // The editorial hero is ~3x the classic header's height — the frosted
    // white bar must not appear until the cover has actually scrolled away
    const galleryFadeRange = editorial
      ? [EDITORIAL_HERO_HEIGHT - 180, EDITORIAL_HERO_HEIGHT - 110]
      : [60, 130];

    // White background + hairline — on the gallery AND page tabs it fades
    // in as that tab's content scrolls under the bar (same contract);
    // moments keeps an always-opaque bar. With no page created, the
    // background clears again as the Page tab comes on screen.
    const bgStyle = useAnimatedStyle(() => {
      "worklet";
      const galleryBg = interpolate(
        galleryScrollY.value,
        galleryFadeRange,
        [0, 1],
        Extrapolation.CLAMP,
      );
      const pageOwnBg = interpolate(
        pageScrollY.value,
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      // Blend between the neighboring tabs' scroll-driven opacities as the
      // pager moves: gallery(0) → page(1) → moments(2, always opaque)
      const pos = scrollPosition.value;
      const pageBg =
        pos <= 1
          ? interpolate(pos, [0, 1], [galleryBg, pageOwnBg], Extrapolation.CLAMP)
          : interpolate(pos, [1, 2], [pageOwnBg, 1], Extrapolation.CLAMP);
      const pagePresence = pageExists
        ? 0
        : 1 -
          Math.min(Math.abs(scrollPosition.value - 1), 1);
      return { opacity: pageBg * (1 - pagePresence) };
    });

    // Gallery actions (index 0) — pinned to the bar's center on the
    // gallery tab at every scroll depth (the glass buttons float over the
    // header backdrop and the frosted bar alike); they fade out as the
    // pager moves toward the Page tab, handing the center to its title.
    const galleryActionsStyle = useAnimatedStyle(() => {
      "worklet";
      return {
        opacity: interpolate(
          scrollPosition.value,
          [0, 0.5],
          [1, 0],
          Extrapolation.CLAMP,
        ),
      };
    });

    // Page title (index 1) — like the gallery title, it only appears once
    // the page content has scrolled under the bar; suppressed entirely
    // until a page exists
    const pageTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const tabOpacity = interpolate(
        scrollPosition.value,
        [0.5, 1, 1.5],
        [0, 1, 0],
        Extrapolation.CLAMP,
      );
      const scrollOpacity = interpolate(
        pageScrollY.value,
        [60, 130],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity: pageExists ? tabOpacity * scrollOpacity : 0 };
    });

    // Moments title (index 2)
    const momentsTitleStyle = useAnimatedStyle(() => {
      "worklet";
      const opacity = interpolate(
        scrollPosition.value,
        [1.5, 2],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    return (
      <View
        style={[styles.container, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        {/* Frosted light bar: live blur of the content scrolling beneath
            plus a light wash — same material as the tabs' top bar. The
            scroll-driven bgStyle fades the whole stack in/out. */}
        <Animated.View
          style={[styles.background, bgStyle]}
          pointerEvents="none"
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={40}
            tint="light"
          />
          <View style={styles.backgroundFrost} />
        </Animated.View>

        {/* Content */}
        <View style={styles.content} pointerEvents="box-none">
          {editorial ? (
            <View style={styles.editorialEdge}>
              <GlassCircleButton
                onPress={onBack}
                label="Back"
                size={36}
                tint="dark"
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </GlassCircleButton>
            </View>
          ) : (
            <Pressable onPress={onBack} style={styles.navButton}>
              <Ionicons name="chevron-back" size={26} color="#000" />
            </Pressable>
          )}

          <View style={styles.titleContainer} pointerEvents="box-none">
            {/* Editorial keeps the bar's center clear on the gallery tab —
                activity / chat / map live in the page content there */}
            {!editorial && (
              <Animated.View
                style={[styles.actionsRow, galleryActionsStyle]}
                pointerEvents="box-none"
              >
                <GlassCircleButton
                  onPress={handleOpenActivity}
                  label="Album activity"
                >
                  <Ionicons name="pulse-outline" size={17} color="#111" />
                </GlassCircleButton>
                <View>
                  <GlassCircleButton
                    onPress={handleOpenChat}
                    label="Album chat"
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={17}
                      color="#111"
                    />
                  </GlassCircleButton>
                  {chatUnreadCount > 0 && (
                    <View style={styles.unreadBadge} pointerEvents="none">
                      <Text style={styles.unreadBadgeText}>
                        {chatUnreadCount >= UNREAD_CAP
                          ? `${UNREAD_CAP}+`
                          : chatUnreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <GlassCircleButton onPress={handleOpenMap} label="Album map">
                  <Ionicons name="map-outline" size={17} color="#111" />
                </GlassCircleButton>
              </Animated.View>
            )}
          </View>

          {/* Tab titles center against the WHOLE bar, not the flexible
              middle slot — the side clusters are asymmetric (especially
              editorial's Share pill + overflow vs the lone back button),
              which visibly shifted the title off-center. Non-interactive,
              so the overlay never steals touches. */}
          <View style={styles.titleOverlay} pointerEvents="none">
            <Animated.Text
              style={[styles.titleDark, styles.titleAbsolute, pageTitleStyle]}
              numberOfLines={1}
            >
              Page
            </Animated.Text>
            <Animated.Text
              style={[
                styles.titleDark,
                styles.titleAbsolute,
                momentsTitleStyle,
              ]}
              numberOfLines={1}
            >
              Moments
            </Animated.Text>
          </View>

          {editorial ? (
            <View
              style={[styles.editorialEdge, styles.editorialRight]}
              pointerEvents="box-none"
            >
              {/* Share fades with the gallery tab (its press handler is
                  gated the same way as the classic cluster's) */}
              <Animated.View style={galleryActionsStyle}>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [
                    styles.sharePill,
                    pressed && styles.sharePillPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Share album"
                >
                  <Ionicons name="share-outline" size={15} color="#fff" />
                  <Text style={styles.sharePillLabel}>Share</Text>
                </Pressable>
              </Animated.View>
              <GlassCircleButton
                onPress={onSettingsPress}
                label="Album settings"
                size={36}
                tint="dark"
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
              </GlassCircleButton>
            </View>
          ) : (
            <Pressable onPress={onSettingsPress} style={styles.navButton}>
              <Ionicons name="settings-outline" size={24} color="#000" />
            </Pressable>
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.08)",
    overflow: "hidden",
  },
  backgroundFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 8,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  titleDark: {
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  titleAbsolute: {
    position: "absolute",
  },
  // Spans the full content row so titles center on the true bar midline
  titleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  // Editorial chrome — smoked glass, legible over the dark cover hero
  // AND the frosted white bar alike (iOS-Photos-style dark circles)
  editorialEdge: {
    minWidth: 44,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  editorialRight: {
    gap: 8,
    justifyContent: "flex-end",
  },
  sharePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(28, 28, 30, 0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  sharePillPressed: {
    transform: [{ scale: 0.96 }],
  },
  sharePillLabel: {
    fontSize: 14,
    ...font.semibold,
    color: "#fff",
  },
  // Same visual language as the AlbumTabs live dot, but sized for a count
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    paddingHorizontal: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    lineHeight: 12,
  },
});

export default AlbumNavBar;
